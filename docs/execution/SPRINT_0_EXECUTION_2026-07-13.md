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
| UX-02 | Revisión contextual y accionable | Prototipo navegable aislado implementado y exportable; sin integración productiva, aprobación de piloto ni evidencia U0 | `prototypes/ux02`, 11/11 contratos UX-02, config nativa resuelta sin permisos Android activos, Expo Doctor 18/18 y handoff versionado |
| COPY-01 | Copy externo sin jerga de implementación | Implementado con cobertura estática parcial; QA nativo pendiente | Detector AST sobre copy directo y traductores registrados; no sustituye revisión de contenido dinámico o dispositivo |
| ENG-01 | Typecheck/lint incremental | Parcial y medido | 20 módulos del núcleo pasan; Deno check/lint pasa con config/lock junto a la función; deuda global: 53 diagnósticos en 10 archivos |
| SYNC-01 | Cola corrupta no silenciosa | Implementado y cubierto por regresión local | Aviso durable mínimo en Hoy/Cuenta, confirmación explícita y recuperación fail-closed |
| PRV-01 | Retención de métricas | Diseño documentado; decisión bloqueada | `docs/privacy/METRIC_ENTRY_RETENTION_DECISION_2026-07-13.md`; no se cambió la DB sin Legal/DPO |
| CI-01 | CI high/critical, privacidad, secretos y gates estáticos incrementales | Implementado y PASS remoto | [GitHub Actions #29293297372](https://github.com/Proyectohexis/hexis-app/actions/runs/29293297372) |
| U0-01 | Protocolo de discovery/usabilidad | Listo para aprobación; 0 participantes y 0 sesiones | `docs/research/PROTOCOLO_RESEARCH_U0_2026-07-13.md` |
| DB-01 | Consolidación de migración 006 | Diferido hasta inventario remoto | No se debe reescribir una migración potencialmente aplicada sin comparar dev/staging |
| DATA-01 | Supabase dev/staging | Bloqueado por acceso/owner | Inventario remoto y proyecto autorizado |

## Evidencia local integrada

| Control | Resultado |
|---|---:|
| Sintaxis JavaScript | 105 archivos válidos |
| Dependencias declaradas | PASS |
| Typecheck incremental del núcleo | 20 módulos, PASS |
| Typecheck global de deuda | 53 diagnósticos en 10 archivos; FAIL conocido, fuera del gate incremental |
| Deno 2.8.1 check/lint de Edge Function | PASS con lock congelado |
| Unit tests y contratos | 175/175 PASS |
| UX-02 navegable aislado | 11/11 contratos, envelope sintético fail-closed, config nativa resuelta PASS, Expo Doctor 18/18, bundles Hermes Android 1.79 MB e iOS 1.78 MB |
| Contrato editorial parcial y transparencia de borrado lógico | PASS |
| Secret scan de archivos versionados | PASS local; el alcance no incluye historial Git, entropía ni binarios |
| Revisión cruzada de UX-01 y SYNC-01 | PASS: 0 P0/P1 identificados en el alcance local |
| GitHub Actions del commit `8a2a8e7` | PASS: `mobile-checks` y `database-checks`, incluidos TypeScript/Deno |

La evidencia histórica de pgTAP, privacidad local, Expo Doctor y exports permanece en
`docs/execution/EXECUTION_STATUS_2026-07-12.md`. Este corte no la presenta como reejecutada
localmente porque el entorno actual no expone Docker ni `npm` en el `PATH`; el workflow remoto
debe repetir esos gates.

## Riesgos residuales aceptados solo para pre-alpha local

- Las pruebas de rollover de Revisión y de aviso de cola validan contrato/dominio, pero no
  sustituyen una prueba real de hooks, RPC espiado, lector de pantalla ni binario nativo.
- El preview UX-02 de Expo Go conserva red para cargar Metro y no es elegible para una sesión U0. El guard de egreso del bundle de producción y el bloqueo Android deben volver a probarse en binarios instalados; iOS, VoiceOver/TalkBack y texto al 200% siguen como preflight externo.
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
- Docker/Supabase, privacidad E2E, Expo Doctor, TypeScript/Deno y bundles quedaron demostrados en
  el CI remoto del commit `8a2a8e7`; su validación física nativa sigue pendiente.

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

**Estado actual:** aprobado para el alcance técnico local de este corte. UX-01, SYNC-01 y COPY-01
pasaron revisión cruzada, el commit `8a2a8e7` está publicado y `mobile-checks`/`database-checks`
terminaron en `success`. Esta aprobación no cierra G0, T1, U0, A0 ni Q1. PRV-01, DB-01 y DATA-01 permanecen
como decisiones o dependencias explícitas; no se disfrazan como trabajo cerrado.

## Handoff del corte

- **Dirección/Legal:** resolver GOV-D01 a GOV-D07 y elegir la política PRV-01.
- **DevOps/QA:** validar en CI remoto los nuevos gates TypeScript/Deno, conservar artefactos y llevar los checks a branch protection cuando exista acceso administrador.
- **Cloud/Database:** inventariar Supabase antes de tocar migraciones aplicadas.
- **Product/UX/Privacy:** aprobar el protocolo U0 antes de reclutar.
- **UX Research/Product/Privacy:** revisar el prototipo UX-02 ya navegable, completar el preflight nativo y solo entonces autorizar o rechazar el piloto T4; no integrarlo en producto antes del veredicto U0.
- **Mobile QA:** validar los nuevos estados de Revisión y cola en binarios/dispositivos reales.
