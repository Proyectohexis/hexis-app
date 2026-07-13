# HEXIS

HEXIS es una app móvil de progreso personal que convierte una identidad elegida en compromisos ejecutables, evidencia diaria y una decisión semanal.

> Compromiso. Disciplina. Transformación.

## Estado real

El vertical slice del MVP está implementado y validado contra el stack oficial local de Supabase, pero el proyecto sigue en **NO-GO para producción, beta externa y datos reales**. Faltan un proyecto remoto inventariado, la matriz física completa Android/iOS, builds firmados y los gates legales, de research y release; el arranque básico vía Expo Go ya fue confirmado en un Android físico.

Actualización de ejecución del 13 de julio de 2026:

- la versión de la pre-alpha quedó alineada en `0.1.0`;
- la primera Revisión ya calcula la última semana ISO cerrada en la zona del plan, comunica la primera fecha elegible y no consulta ni envía semanas fuera de vigencia;
- una cola offline ilegible ya no se restablece silenciosamente: primero persiste un aviso diagnóstico mínimo, falla de forma conservadora si no puede guardarlo y lo muestra en Hoy y Cuenta hasta confirmación;
- el gate local integrado pasa sintaxis en 95 archivos, dependencias declaradas y 158/158 pruebas unitarias/de contrato;
- CI fue preparada para bloquear advisories altos/críticos, ejecutar privacidad E2E, escanear secretos de alta confianza y conservar evidencia compacta; su ejecución remota del nuevo corte debe confirmarse antes de cerrar C0;
- los protocolos de research U0 y de retención de entradas métricas están documentados, pero siguen sin aprobación humana ni datos reales.

Evidencia local del 12 de julio de 2026:

- `npm ci`: correcto y reproducible desde `package-lock.json`.
- `npm run check`: correcto.
- 142/142 pruebas unitarias y de contrato.
- Expo Doctor 18/18.
- bundles Hermes Android 3.50 MB e iOS 3.49 MB generados.
- siete migraciones aplicadas desde cero en el stack oficial local de Supabase y pgTAP 68/68.
- E2E adverso de privacidad correcto contra Auth/REST/Edge Functions locales, incluida respuesta perdida y aislamiento A/B.
- GitHub Actions CI #1 correcta para el commit `79916fe` (`mobile-checks` y `database-checks`).
- carga y render inicial confirmados en un Android físico con Expo Go 54 por LAN; validación funcional nativa aún pendiente.
- `npm audit --omit=dev --audit-level=critical`: cero vulnerabilidades altas o críticas; permanecen avisos moderados transitivos de Expo que no deben corregirse forzando un salto de SDK.

El corte histórico está en `docs/execution/EXECUTION_STATUS_2026-07-12.md`; el estado vigente de ejecución está en `docs/execution/SPRINT_0_EXECUTION_2026-07-13.md`.

## Vertical slice implementado

- Expo SDK 54, React Native 0.81 y React 19 para teléfonos iOS/Android.
- Registro, confirmación, login, logout con advertencia offline y recuperación PKCE.
- Sesión en Keychain/Keystore mediante Expo SecureStore.
- Onboarding con identidad, meta, motivo y 1–3 compromisos.
- Plan y hábitos versionados sin reescribir historia.
- Hoy por fecha civil/zona, evidencia completa o mínima y retractación por evento.
- Cola offline idempotente con backoff, recuperación de conectividad y fallo terminal visible.
- Pausa, reactivación, archivo, edición futura y descansos planificados.
- Vigencia temporal D/D+1: Hoy conserva la versión efectiva, los slots no se liberan antes de fecha y ningún aviso one-shot sobrevive a `ends_on`.
- Consistencia, recuperación, SEC v1 y revisión semanal conciliada.
- Elegibilidad de Revisión por semana ISO cerrada y zona del plan, con estado previo al primer cierre.
- Una métrica opcional con alta, edición, eliminación auditada y aviso contextual.
- Recordatorios locales opt-in, contenido privado, reconciliación y navegación segura a Hoy.
- Guardrails de recordatorios: horizonte one-shot de 21 días, control global, quiet hours, máximo dos por día y confirmación de zona.
- Exportación JSON y eliminación reforzada con contraseña, frase exacta y purga local verificada.
- Taxonomía analítica v1 allowlist, instrumentada y deshabilitada hasta aprobar proveedor/consentimiento.
- RLS deny-by-default, RPC atómicas y harness usuario A/usuario B/anónimo.
- CI móvil y de base de datos versionado.

El proveedor de analítica/observabilidad, validación física completa y builds firmados siguen pendientes. Exportación, eliminación, recordatorios y la frontera analítica están disponibles para prueba interna, todavía no para datos reales.

## Documentos principales

- `docs/strategy/BENCHMARK_HEXIS_2026.md`
- `docs/product/PRODUCT_STRATEGY_AND_PRD.md`
- `docs/architecture/TECHNICAL_ARCHITECTURE.md`
- `docs/roadmap/DEVELOPMENT_PLAN.md`
- `docs/roadmap/ANALISIS_DE_BRECHAS_Y_PLAN_MAESTRO_2026-07-12.md`
- `docs/execution/SPRINT_0_EXECUTION_2026-07-13.md`
- `docs/governance/R0_DECISION_REGISTER_2026-07-13.md`
- `docs/privacy/METRIC_ENTRY_RETENTION_DECISION_2026-07-13.md`
- `docs/research/PROTOCOLO_RESEARCH_U0_2026-07-13.md`
- `supabase/README.md`
- `INFORME_COMPLETO_APLICACION_HEXIS_2026-07-12.md`
- `INFORME_AUDITORIA_INTEGRAL_2026-07-11.md`
- `INFORME_REAUDITORIA_FUNDACIONAL_2026-07-11.md`

## Requisitos

- Node.js 20.19 o superior.
- npm 11 recomendado.
- Para base local: Docker Desktop y Supabase CLI 2.84.2.
- Android: Expo Go 54 específico o un development build compatible con SDK 54.
- iPhone: development/internal build firmado; la App Store no permite instalar una versión antigua de Expo Go.

## Configuración del cliente

```bash
npm ci
cp .env.example .env
```

Proyecto administrado:

```dotenv
EXPO_PUBLIC_SUPABASE_URL=https://PROJECT.supabase.co
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
EXPO_PUBLIC_ALLOW_LOCAL_SUPABASE=false
```

Supabase local admite HTTP y la clave `anon` legacy únicamente con opt-in explícito y host loopback/emulador/red privada:

```dotenv
EXPO_PUBLIC_SUPABASE_URL=http://127.0.0.1:55321
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=LOCAL_ANON_KEY
EXPO_PUBLIC_ALLOW_LOCAL_SUPABASE=true
```

Nunca uses `service_role`, `sb_secret_`, contraseñas de base de datos ni secretos de proveedor en `EXPO_PUBLIC_*`.

Inicia Metro:

```bash
npm start
```

En un Android físico conectado a la misma Wi‑Fi, usa la IP privada del equipo en `.env` —por ejemplo `http://192.168.0.6:55321`— y abre la URL `exp://IP_DEL_EQUIPO:8081` en [Expo Go para SDK 54](https://expo.dev/go?device=true&platform=android&sdkVersion=54). No uses `127.0.0.1` desde el teléfono.

## Calidad móvil

```bash
npm run verify:syntax
npm run verify:deps
npm test
npm run doctor
npm run export:android
npm run export:ios
npm run check
npm run test:privacy:e2e
```

`npm run check` es el gate local reproducible. Un build nativo iOS firmado requiere macOS, identificadores y credenciales; los exports JavaScript no sustituyen esa prueba.

## Supabase local

Lee `supabase/README.md` antes de aplicar cualquier migración.

```bash
npm run db:start
npm run test:db
```

`test:db` reinicia la base local, aplica las siete migraciones desde cero y ejecuta pgTAP. El 12 de julio de 2026 pasó 68/68 en Docker/Supabase oficial local; `test:privacy:e2e` añade los casos adversos de Auth/Edge Functions.

No apliques las migraciones al remoto hasta completar inventario, backup/restauración, staging y reconciliación del cliente legacy. El cambio es aditivo en datos, pero corta las escrituras legacy de `habits`.

## Seguridad y privacidad

- RLS está habilitado y forzado en todas las tablas objetivo.
- Las relaciones padre-hijo incluyen `user_id`; las pruebas cubren A/B/anónimo.
- Los eventos de evidencia son append-only; deshacer agrega una retractación.
- La base rechaza evidencia asignada a una fecha futura y tolera como máximo cinco minutos de desfase positivo del reloj del cliente.
- Los reintentos conservan `client_operation_id` y detectan reutilización con payload distinto.
- La cola offline no guarda texto libre; Android backup está deshabilitado. Si el documento local es ilegible, se conserva primero un aviso mínimo sin copiar el payload y la UI informa la posible pérdida hasta confirmación. Su cifrado completo en reposo y la prueba nativa de reinstalación siguen siendo gates.
- No se envían email, identidad, hábitos, notas ni métricas a analítica.
- El repositorio está público y necesita una decisión formal de gobierno: el `LICENSE` MIT aún conserva el copyright heredado del template Expo.

## Alcance de producto

```text
identidad → plan → evidencia diaria → revisión semanal → ajuste
```

IA, comunidad, fotografías, wearables, web y monetización permanecen fuera del MVP hasta demostrar activación, retención y confianza.
