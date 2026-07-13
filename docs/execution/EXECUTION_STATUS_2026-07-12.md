# Estado de ejecución — 12 de julio de 2026

## Resultado de esta etapa

Se implementó y endureció un vertical slice local de HEXIS desde cuenta hasta decisión semanal. La etapa cierra código, contratos y automatización reproducible; no autoriza usuarios reales ni despliegue remoto.

## Entregado

### Producto móvil

- navegación separada por sesión, recuperación y existencia de plan;
- onboarding de identidad/meta/motivo y 1–3 compromisos;
- edición versionada, pausa, reactivación, archivo y descanso planificado;
- Hoy por fecha civil, nivel completo/mínimo y retractación;
- cola offline allowlist, leases, backoff, reintento manual y fallo visible;
- sincronización al recuperar foco, app activa o conectividad;
- revisión de la semana completa anterior, consistencia, recuperación y SEC v1;
- agrupación de versiones por `lineage_id` y bloqueo si existe evidencia sin conciliar;
- una métrica opcional con CRUD y tombstones;
- recuperación de contraseña PKCE reintentable e intento de cierre global, con advertencia si la revocación remota no puede confirmarse;
- advertencia explícita antes de descartar operaciones offline al cerrar sesión;
- recordatorios locales opt-in con permiso progresivo, contenido privado y reconciliación;
- exportación JSON y eliminación reforzada de cuenta con purga local y aviso de residuos.

### Datos y seguridad

- migración legacy de seguridad y seis migraciones del modelo objetivo;
- `profiles`, `plans`, hábitos v2, eventos, excepciones, métricas, entradas y revisiones;
- 14 RPC con ownership, privacidad e idempotencia;
- RLS habilitado/forzado, grants mínimos y relaciones compuestas `(id, user_id)`;
- eventos append-only, versionado temporal y recibos privados sin contenido sensible;
- configuración local generada en `supabase/config.toml`;
- CI independiente para app y base efímera.

### Evidencia reproducible

| Gate | Resultado local |
|---|---:|
| `npm ci` | PASS |
| Sintaxis | 91 archivos PASS |
| Imports declarados | PASS |
| Unit tests/contratos | 142/142 PASS |
| Expo Doctor | 18/18 PASS |
| Export Android | PASS, Hermes 3.50 MB |
| Export iOS | PASS, Hermes 3.49 MB |
| Supabase oficial local + pgTAP | 68/68 PASS |
| Auth + privacidad adversa temporal E2E | PASS: A/B, reauth, 4 KiB, media type y respuesta perdida |
| Android físico / Expo Go 54 / arranque asistido | PASS limitado: bundle recibido y app abierta; modelo, versión Android y versión exacta de Expo Go no inventariados |
| Auditoría dependencias alta/crítica | 0 |
| Reauditoría estática de accesibilidad | Sin P0/P1 confirmables por código; dispositivo pendiente |

Las siete migraciones se aplicaron desde cero en PostgreSQL 17 dentro del stack oficial local de Supabase. La validación remota y backup/restauración siguen pendientes.

## Gate técnico interno — Fase operativa 9

**APROBADO: 0 P0 / 0 P1 abiertos en código y contratos locales.** El re-gate independiente cubrió transiciones D/D+1, reservas futuras de slots, recordatorios acotados, descansos, cambio de fecha, cambio de zona, privacidad e aislamiento. Esta aprobación no equivale al Gate Q1: siguen pendientes dispositivos físicos, builds firmados, dogfood, observabilidad aprobada y operación remota.

Riesgos P2 aceptados solo para desarrollo local: si la zona cambia con la app terminada, los one-shots se cancelan en el siguiente inicio; la migración temporal `006` parchea funciones de forma fail-closed pero debe consolidarse como SQL explícito antes de producción; y falta una prueba concurrente real desde dos sesiones.

## Correcciones de integración aplicadas

- Un cambio `full → minimum` ya no reutiliza un ID idempotente con otro payload.
- La revisión genera un ID nuevo al modificar reflexión/decisión tras un fallo.
- Crear hábitos usa el primer slot libre `0..2`; reactivar resuelve huecos en backend.
- Today rechaza una mutación si la fecha civil cambió antes del toque.
- Los errores terminales offline dejaron de ocultarse.
- Review no puede cerrar una semana con operaciones locales pendientes.
- La recuperación no invalida localmente un enlace por un fallo temporal.
- La restauración de sesión ya no puede dejar un spinner eterno si SecureStore rechaza.
- Supabase local admite HTTP/JWT `anon` solo con flag y host privado explícitos.
- Contraseñas de solo espacios y fechas futuras de métricas se rechazan en cliente.
- La base rechaza evidencia diaria futura y timestamps adelantados más de cinco minutos; las retractaciones históricas siguen permitidas.
- Cerrar sesión cancela los recordatorios y limpia solo la cola offline de la cuenta autenticada antes de revocar la sesión; las pruebas multicuenta conservan operaciones ajenas.
- Si falla la persistencia después de programar recordatorios, los avisos recién creados se cancelan para evitar huérfanos.
- La función destructiva mide el cuerpo real en streaming, valida JSON y rechaza peticiones mayores de 4 KiB.
- La respuesta perdida de eliminación se reconcilia con un recibo server-only de expiración lógica de 24 horas.
- La exportación usa campos explícitos y excluye identificadores internos de idempotencia.
- Recordatorios aplican one-shots con horizonte rodante de 21 días, control global, quiet hours, máximo dos por weekday y confirmación explícita al cambiar de zona.
- La taxonomía analítica v1 está instrumentada con allowlist y rechazo de PII, pero el sink permanece deshabilitado.
- Una edición, pausa o archivo efectivo en D+1 conserva la versión de D en Hoy y Disciplina; el cliente bloquea un segundo ajuste incompatible hasta la fecha efectiva.
- Los slots `0..2` se validan por solapamiento del intervalo completo propuesto contra rangos presentes y futuros en las RPC de alta, reemplazo y reactivación, no por el estado raw adelantado.
- Los recordatorios conservan solo ocurrencias válidas hasta `ends_on`, se reconcilian al iniciar, reanudar o cruzar la fecha y nunca dejan una recurrencia vieja en D+1; un cambio de zona suspende avisos aun sin plan listo.
- Las excepciones activas se cargan para todo el horizonte; programar o quitar un descanso cancela/restaura su one-shot y los tombstones eliminados no vuelven a excluir el día.

## Bloqueos externos y de release

### T1 — Backend real

- Docker Desktop, WSL2 y Supabase oficial local están operativos; el puerto API local de este equipo es `55321`.
- El proyecto histórico `crtncubknchyhodbqwio.supabase.co` no resuelve DNS.
- Falta crear o recuperar un proyecto Supabase de desarrollo, inventariar el remoto y probar backup/restauración.
- No aplicar el cutover mientras un cliente legacy siga escribiendo `habits`.

### Privacidad/cuenta

- Exportación y eliminación autenticada pasaron E2E local normal y adverso; falta validar el menú nativo y la limpieza física en Android/iOS.
- Falta política aprobada, retención, soporte y propietario de privacidad.
- La cola offline minimiza datos y Android no la respalda, pero aún usa AsyncStorage sin cifrado integral.

### Distribución

- Faltan bundle IDs, proyecto EAS, cuentas Apple/Google, assets finales y builds firmados.
- El redirect `hexis://auth/reset-password` debe autorizarse en Supabase; producción necesita Universal Links/App Links verificados.
- El arranque básico en un Android físico vía Expo Go quedó confirmado; siguen pendientes build firmado, matriz iOS/Android, recordatorios, accesibilidad y QA nativo funcional.

### Producto y operación

- Faltan entrevistas/pruebas con 12–15 personas y 5–8 pruebas de usabilidad.
- La frontera de analítica redactada está implementada; faltan proveedor aprobado/consentimiento, crash reporting, soporte y runbooks sin PII.
- La licencia visible y el carácter público/privado del repositorio siguen sin decisión formal.

## Próxima secuencia autorizable

1. Completar el smoke test manual en la demo Android ya abierta: relanzamiento en frío/caliente, navegación, autenticación, onboarding, Hoy, check-in, sincronización y recuperación de error.
2. Crear/reparar Supabase dev y configurar redirects PKCE.
3. Inventariar remoto, backup/restore y staging; resolver diferencias antes de migrar.
4. Probar exportación y recordatorios en dispositivos; los casos adversos de privacidad ya están automatizados localmente.
5. Definir bundle IDs, propietario EAS y producir el primer APK `preview` firmado.
6. Ejecutar accesibilidad, performance y seguridad nativas.
7. Realizar discovery/usabilidad; ajustar P0 con evidencia.
8. Solo entonces autorizar una alpha externa.
