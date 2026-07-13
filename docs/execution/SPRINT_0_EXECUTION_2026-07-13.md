# Ejecución Sprint 0 — HEXIS

**Inicio:** 13 de julio de 2026

**Alcance:** R0 Gobierno + R1 Integridad local

**Estado:** corte técnico C0 aprobado; decisiones y gates externos pendientes

## Objetivo del corte

Cerrar el P1 de primera Revisión, eliminar pérdida silenciosa ante cola corrupta, alinear CI con el gate declarado y dejar separadas las decisiones externas que requieren al propietario.

## Estado de trabajo

| ID | Entregable | Estado al 13 de julio | Evidencia |
|---|---|---|---|
| GOV-01 | Registro de decisiones legales/visibilidad | Parcial | `docs/governance/R0_DECISION_REGISTER_2026-07-13.md` |
| GOV-02 | IDs, cuentas y owners | Bloqueado por decisiones externas | Registro GOV-D04 a GOV-D07 |
| VER-01 | Versionado pre-alpha | Implementado y validado localmente | `app.json`, `package.json` y lock en `0.1.0` |
| UX-01 | Elegibilidad de primera Revisión | Implementado y cubierto por regresión local | UI no consulta ni envía una semana fuera de vigencia; pruebas de semana parcial, lunes y zona |
| UX-02 | Revisión contextual y accionable | Handoff de baja fidelidad listo; sin integración productiva ni evidencia U0 | `docs/product/UX_02_REVISION_CONTEXTUAL_ACCIONABLE_HANDOFF_2026-07-13.md` |
| COPY-01 | Copy externo sin jerga de implementación | Implementado con cobertura estática parcial; QA nativo pendiente | Detector AST sobre copy directo y traductores registrados; no sustituye revisión de contenido dinámico o dispositivo |
| ENG-01 | Typecheck/lint incremental | Parcial y medido | 20 módulos del núcleo pasan; Deno check/lint pasa con config/lock junto a la función; deuda global: 53 diagnósticos en 10 archivos |
| SYNC-01 | Cola corrupta no silenciosa | Implementado y cubierto por regresión local | Aviso durable mínimo en Hoy/Cuenta, confirmación explícita y recuperación fail-closed |
| PRV-01 | Retención de métricas | Diseño documentado; decisión bloqueada | `docs/privacy/METRIC_ENTRY_RETENTION_DECISION_2026-07-13.md`; no se cambió la DB sin Legal/DPO |
| CI-01 | CI high/critical, privacidad y secretos | Implementado y PASS remoto | [GitHub Actions #29287951627](https://github.com/Proyectohexis/hexis-app/actions/runs/29287951627) |
| U0-01 | Protocolo de discovery/usabilidad | Listo para aprobación; 0 participantes y 0 sesiones | `docs/research/PROTOCOLO_RESEARCH_U0_2026-07-13.md` |
| DB-01 | Consolidación de migración 006 | Diferido hasta inventario remoto | No se debe reescribir una migración potencialmente aplicada sin comparar dev/staging |
| DATA-01 | Supabase dev/staging | Bloqueado por acceso/owner | Inventario remoto y proyecto autorizado |

## Evidencia local integrada

| Control | Resultado |
|---|---:|
| Sintaxis JavaScript | 97 archivos válidos |
| Dependencias declaradas | PASS |
| Typecheck incremental del núcleo | 20 módulos, PASS |
| Typecheck global de deuda | 53 diagnósticos en 10 archivos; FAIL conocido, fuera del gate incremental |
| Deno 2.8.1 check/lint de Edge Function | PASS con lock congelado |
| Unit tests y contratos | 164/164 PASS |
| Contrato editorial parcial y transparencia de borrado lógico | PASS |
| Secret scan de archivos versionados | PASS local; el alcance no incluye historial Git, entropía ni binarios |
| Revisión cruzada de UX-01 y SYNC-01 | PASS: 0 P0/P1 identificados en el alcance local |
| GitHub Actions del commit `d22ab54` | PASS: `mobile-checks` y `database-checks` |

La evidencia histórica de pgTAP, privacidad local, Expo Doctor y exports permanece en
`docs/execution/EXECUTION_STATUS_2026-07-12.md`. Este corte no la presenta como reejecutada
localmente porque el entorno actual no expone Docker ni `npm` en el `PATH`; el workflow remoto
debe repetir esos gates.

## Riesgos residuales aceptados solo para pre-alpha local

- Las pruebas de rollover de Revisión y de aviso de cola validan contrato/dominio, pero no
  sustituyen una prueba real de hooks, RPC espiado, lector de pantalla ni binario nativo.
- La regresión editorial inspecciona copy estático directo y helpers registrados; no sigue todo el
  flujo de datos dinámico ni sustituye revisión humana, truncado o lector de pantalla.
- El marcador de recuperación conserva hasta 32 `user_id` opacos por generación en
  AsyncStorage, sin contenido de evidencia y sin cifrado integral. Al superar el límite se vuelve
  a mostrar el aviso; nunca se silencia para otra cuenta.
- Cerrar sesión elimina el reconocimiento de esa cuenta, por lo que el aviso puede reaparecer al
  volver a entrar. Es repetitivo, pero conserva la postura fail-safe.
- El secret scan cubre archivos de texto versionados en la revisión actual, no historial Git,
  entropía, binarios ni archivos mayores de 2 MiB.
- Las Actions usan tags mayores y `ubuntu-latest`, no SHAs/imagen inmutables.
- Docker/Supabase, privacidad E2E, Expo Doctor y bundles quedaron demostrados en el CI remoto
  del commit `d22ab54`; su validación física nativa sigue pendiente.

## Reglas de ejecución

- No se crean entornos remotos ni se usan datos reales sin owner y acceso autorizados.
- No se inventan bundle IDs permanentes ni régimen de licencia.
- Ningún hallazgo se considera cerrado sin prueba reproducible.
- CI local y remota deben pasar antes de cerrar este corte.
- Alpha, beta y producción continúan bloqueadas.

## Bloqueos externos

- Titular legal, licencia y visibilidad deseada.
- Identificadores permanentes Android/iOS.
- Organización y accesos Expo/EAS, Apple, Google y Supabase.
- Owners nominales de Producto, Privacidad, Backend, Release y Soporte.

## Gate de salida C0

- Primera Revisión elegible y probada.
- Cola corrupta nunca se recupera de forma silenciosa.
- CI bloquea high/critical y ejecuta privacidad/secret scan.
- Suites locales completas verdes.
- Cero P0/P1 local conocido dentro del alcance ejecutado, o excepción explícita.

**Estado actual:** aprobado para el alcance técnico local de este corte. UX-01 y SYNC-01 pasaron
revisión cruzada, el commit `d22ab54` está publicado y `mobile-checks`/`database-checks` terminaron
en `success`. Esta aprobación no cierra G0, T1, U0, A0 ni Q1. PRV-01, DB-01 y DATA-01 permanecen
como decisiones o dependencias explícitas; no se disfrazan como trabajo cerrado.

## Handoff del corte

- **Dirección/Legal:** resolver GOV-D01 a GOV-D07 y elegir la política PRV-01.
- **DevOps/QA:** validar en CI remoto los nuevos gates TypeScript/Deno, conservar artefactos y llevar los checks a branch protection cuando exista acceso administrador.
- **Cloud/Database:** inventariar Supabase antes de tocar migraciones aplicadas.
- **Product/UX/Privacy:** aprobar el protocolo U0 antes de reclutar.
- **Interaction Design/UX Research:** convertir UX-02 en prototipo navegable, ejecutar piloto y validar T4; no implementar antes del veredicto U0.
- **Mobile QA:** validar los nuevos estados de Revisión y cola en binarios/dispositivos reales.
