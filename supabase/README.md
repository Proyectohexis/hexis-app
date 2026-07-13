# Supabase en HEXIS

## Estado del gate

El esquema objetivo, las operaciones atómicas y un harness RLS están versionados. **Ninguna migración de esta carpeta se ha aplicado al Supabase remoto desde este repositorio.**

Estado de seguridad: **aprobado para validación en local/staging; bloqueado para datos reales y producción** hasta inventariar el remoto, probar backup/restauración y ejecutar las pruebas contra Supabase real.

## Migraciones

| Migración | Responsabilidad |
|---|---|
| `202607110001_legacy_security_baseline.sql` | Contrato legacy (`habits`, `progress`, `streaks`) y RLS mínimo. |
| `202607120001_target_domain_model.sql` | Perfiles, planes, hábitos v2, eventos, excepciones, métricas, revisiones, constraints, índices, RLS y RPC core. |
| `202607120002_habit_lifecycle_operations.sql` | Versionado de hábitos, pausa/reactivación, descansos y recibos privados de idempotencia. |
| `202607120003_metric_operations.sql` | Una métrica activa por plan, CRUD transaccional de entradas y tombstones. |

La migración objetivo es aditiva:

- conserva `progress`, `streaks`, `habits.completed` y `habits.completed_date`;
- marca las filas existentes de `habits` con `model_version = 1`;
- exige el contrato completo a toda nueva fila `model_version = 2`;
- no migra ni elimina datos legacy automáticamente;
- aborta si detecta un estado objetivo parcial o policies desconocidas.

Aunque no elimina datos, esta migración representa un **cutover de escritura**: revoca las mutaciones directas del prototipo sobre `habits` y hace que las nuevas filas pertenezcan al modelo v2. No debe aplicarse mientras una versión legacy del cliente siga creando o actualizando `completed/completed_date`. Si se necesita convivencia temporal, deberá diseñarse una migración de transición y probar ambos clientes; no se debe relajar el esquema objetivo improvisadamente en producción.

## Contrato de datos

Tablas expuestas con RLS:

- `profiles`
- `plans`
- `habits`
- `habit_completion_events`
- `habit_schedule_exceptions`
- `transformation_metrics`
- `metric_entries`
- `weekly_reviews`

Vista:

- `habit_daily_evidence`: evidencia `recorded` que no tiene una retractación; usa `security_invoker` y respeta RLS de las tablas base.

Tablas internas en `hexis_private`:

- `habit_operation_receipts`
- `schedule_exception_operation_receipts`
- `metric_entry_operation_receipts`

Los recibos solo guardan identificadores, tipo de operación y fingerprint. No duplican nombres de hábitos, razones, reflexiones, valores ni notas.

### Tiempo y calendario

- `plans.timezone` congela la zona IANA del ciclo.
- `profiles.timezone` es la preferencia actual del usuario.
- `habits.timezone` congela la programación de cada versión.
- `habit_completion_events` conserva `occurred_at`, `local_date` y `timezone` históricos.
- Cambiar la zona del perfil no reescribe el plan, los hábitos ni los eventos.

### Versionado de hábitos

Una edición de configuración nunca actualiza retrospectivamente la programación:

- `lineage_id` identifica el compromiso lógico;
- `replaces_habit_id` enlaza la versión anterior;
- `version_number` aumenta de forma monotónica;
- `starts_on` y `ends_on` delimitan el intervalo;
- pausar/archivar cierra la versión;
- reactivar crea una versión nueva;
- `position` está limitado a `0..2`, con máximo transaccional de tres hábitos activos por plan.

### Evidencia y descansos

`habit_completion_events` es append-only para clientes. Deshacer crea un evento `retracted`; no actualiza ni elimina el evento original.

`habit_schedule_exceptions.kind` admite:

- `rest`: descanso planificado;
- `skip`: exclusión excepcional explícita.

Ambos excluyen la fecha del denominador y de Hoy. Un día programado sin evidencia y sin excepción continúa siendo un día no realizado. Eliminar una excepción usa `deleted_at`; RLS oculta los tombstones.

### Transformación

El MVP permite un solo `transformation_metrics.status = 'active'` por plan. Las entradas:

- validan el valor contra los límites de su métrica;
- son idempotentes por operación;
- se editan mediante RPC;
- se eliminan con tombstone para que el reintento offline no resucite el dato;
- quedan ocultas en lecturas autenticadas cuando `deleted_at` no es nulo.

## RPC públicas

Todas devuelven JSON con el objeto y `idempotent`.

```text
create_initial_plan(
  p_identity_statement text,
  p_outcome_statement text,
  p_why_statement text,
  p_timezone text,
  p_habits jsonb,
  p_client_operation_id uuid,
  p_starts_on date default null,
  p_ends_on date default null
) -> { plan, habits, idempotent }

create_habit(
  p_plan_id uuid,
  p_name text,
  p_minimum_action text,
  p_scheduled_weekdays smallint[],
  p_timezone text,
  p_client_operation_id uuid,
  p_effective_on date default null,
  p_cue_type text default 'none',
  p_cue_value jsonb default {},
  p_reminder_time time default null,
  p_position smallint default null
) -> { habit, idempotent }

replace_habit_configuration(
  p_habit_id uuid,
  p_name text,
  p_minimum_action text,
  p_scheduled_weekdays smallint[],
  p_timezone text,
  p_effective_on date,
  p_client_operation_id uuid,
  p_cue_type text default 'none',
  p_cue_value jsonb default {},
  p_reminder_time time default null,
  p_position smallint default null
) -> { habit, idempotent }

set_habit_status(
  p_habit_id uuid,
  p_status text,
  p_effective_on date,
  p_client_operation_id uuid
) -> { habit, idempotent }

record_habit_completion(
  p_habit_id uuid,
  p_local_date date,
  p_occurred_at timestamptz,
  p_timezone text,
  p_client_operation_id uuid,
  p_completion_level text default 'full',
  p_source text default 'manual'
) -> { event, idempotent }

retract_habit_completion(
  p_habit_id uuid,
  p_local_date date,
  p_occurred_at timestamptz,
  p_timezone text,
  p_client_operation_id uuid,
  p_source text default 'manual'
) -> { event, idempotent }

set_habit_schedule_exception(
  p_habit_id uuid,
  p_local_date date,
  p_kind text,
  p_reason text,
  p_client_operation_id uuid
) -> { exception, idempotent }

remove_habit_schedule_exception(
  p_exception_id uuid,
  p_client_operation_id uuid
) -> { exception, idempotent }

create_transformation_metric(
  p_plan_id uuid,
  p_kind text,
  p_label text,
  p_unit text,
  p_client_operation_id uuid
) -> { metric, idempotent }

record_metric_entry(
  p_metric_id uuid,
  p_value numeric,
  p_local_date date,
  p_recorded_at timestamptz,
  p_note text,
  p_client_operation_id uuid
) -> { entry, idempotent }

update_metric_entry(
  p_entry_id uuid,
  p_value numeric,
  p_local_date date,
  p_note text,
  p_client_operation_id uuid
) -> { entry, idempotent }

delete_metric_entry(
  p_entry_id uuid,
  p_client_operation_id uuid
) -> { entry, idempotent }

complete_weekly_review(
  p_plan_id uuid,
  p_week_start date,
  p_reflection text,
  p_decision text,
  p_client_operation_id uuid
) -> { review, idempotent }
```

`create_initial_plan`, revisión y los mutadores de hábitos/métricas usan `security definer` porque deben modificar columnas de historial o fingerprints que no se conceden directamente al cliente. Están endurecidos con `search_path = ''`, `auth.uid()` explícito, filtros de ownership y payload construido server-side. Check-in y retractación conservan `security invoker` con grants mínimos.

## Matriz de acceso

| Recurso | `anon` | `authenticated` | `service_role` |
|---|---|---|---|
| Tablas de usuario | Sin acceso | SELECT propio + operaciones mínimas/RPC | Mantenimiento confiable |
| Plan/hábito/configuración | Sin acceso | RPC; sin INSERT/UPDATE directo | Acceso completo |
| Eventos | Sin acceso | SELECT/INSERT propio; sin UPDATE/DELETE | Acceso completo |
| Excepciones | Sin acceso | SELECT propio; mutación por RPC | Acceso completo |
| Métricas/entradas | Sin acceso | SELECT propio; mutación por RPC | Acceso completo |
| Vista de evidencia | Sin acceso | SELECT propio | SELECT completo |
| `hexis_private` | Sin acceso | Solo ejecución del validador de timezone requerido por RPC invoker | Sin acceso a recibos vía Data API |

RLS está habilitado y forzado. Las relaciones padre-hijo usan FKs compuestas `(id, user_id)` para impedir asociaciones cruzadas aunque un cliente falsifique `user_id`.

## Verificación realizada

Evidencia local del 12 de julio de 2026:

- stack oficial local de Supabase/PostgreSQL 17: 7 migraciones aplicadas desde cero;
- smoke funcional: plan, límite de hábitos, eventos/retractación, descansos, versionado, métrica/entrada, revisión, exportación, aislamiento B, `anon` y cascade de cuenta;
- pgTAP oficial local: **68/68 aserciones aprobadas**, incluidos solapamiento temporal D/D+1, reservas futuras y ocupación de slots;
- Auth/REST/Edge Functions: E2E adverso con A/B, contraseña incorrecta, body chunked >4 KiB, Content-Type, eliminación, respuesta perdida y rechazo del login posterior aprobado.

Esto valida el entorno oficial local. No sustituye inventario, backup/restauración, staging ni pruebas contra el proyecto remoto autorizado.

## Procedimiento obligatorio antes de staging/producción

1. Fijar e instalar la versión aprobada de Supabase CLI.
2. Ejecutar `supabase init` sin sobrescribir migraciones.
3. Crear proyectos separados para desarrollo, staging y producción.
4. Hacer backup y probar una restauración del remoto actual.
5. Ejecutar `supabase db dump`/`db pull` e inventariar tablas, constraints, funciones, grants, triggers y **todas** las policies.
6. Resolver cualquier diferencia; no editar/borrar silenciosamente objetos desconocidos.
7. Ejecutar en local:

   ```powershell
   supabase start
   supabase db reset
   supabase test db
   ```

8. Repetir migraciones y pruebas contra staging vacío y contra una copia sanitizada del estado real.
9. Reconciliar conteos y checksums del modelo legacy antes de escribir una migración de datos.
10. Probar backup/restauración y rollback operativo.
11. Solo entonces promover mediante CI y revisión humana de Database Engineering + AppSec.

## Variables del cliente

```dotenv
EXPO_PUBLIC_SUPABASE_URL=https://PROJECT.supabase.co
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

La publishable key puede estar en el bundle. Una `service_role`, contraseña de base de datos o secreto de proveedor nunca debe usar `EXPO_PUBLIC_` ni entrar al cliente.

Referencias oficiales: [RLS de Supabase](https://supabase.com/docs/guides/database/postgres/row-level-security), [funciones de base de datos](https://supabase.com/docs/guides/database/functions) y [seguridad de la Data API](https://supabase.com/docs/guides/api/securing-your-api).
