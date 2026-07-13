# Pruebas SQL de HEXIS

## Alcance

`rls_target_model_test.sql` ejecuta el contrato de datos dentro de una transacción y termina con `ROLLBACK`. Cubre:

- usuario A, usuario B y rol `anon`;
- aislamiento RLS de planes, hábitos, evidencia y métricas;
- privilegios directos negados para escrituras controladas por RPC;
- idempotencia de plan, hábitos, eventos, métricas y revisión semanal;
- eventos append-only y retractación;
- versionado de configuración, pausa y reactivación de hábitos;
- descansos/exclusiones programadas;
- una métrica activa por plan y tombstones de entradas.

## Ejecución local

Requisitos: Docker Desktop, Supabase CLI fijada por el proyecto y PostgreSQL local iniciado por Supabase.

```powershell
supabase start
supabase db reset
supabase test db supabase/tests/rls_target_model_test.sql
```

Si la versión de CLI no acepta una ruta después de `test db`, use:

```powershell
supabase test db
```

## Gate

El parseo estático no sustituye esta prueba. No se puede declarar T1 aprobado hasta que `db reset` y este harness terminen en cero en local/CI, se repitan contra staging y se inventaríen las policies reales antes de promover migraciones.
