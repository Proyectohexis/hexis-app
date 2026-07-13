# Reauditoría fundacional — HEXIS

**Fecha de corte:** 11 de julio de 2026
**Alcance:** estrategia, producto, cliente Expo/React Native, dependencias, autenticación, almacenamiento de sesión, fecha civil, acceso a datos legacy, accesibilidad automatizable, CI y preparación de release.
**Veredicto:** `T0 CERRADO EN LOCAL` / `T1 BLOQUEADO` / `NO-GO PARA BETA O DATOS REALES`.

## 1. Resumen ejecutivo

El repositorio pasó de un prototipo que no generaba bundle a una base móvil reproducible y documentada. Android e iOS exportan bundles Hermes, Expo Doctor no reporta incompatibilidades, las dependencias directas están declaradas y existen tests para fecha civil, validación, configuración de Supabase, fragmentación UTF-8 de la sesión y contraste.

Esto permite continuar desarrollo local con una frontera mucho más clara. No autoriza usuarios reales: el proyecto Supabase remoto no pudo inventariarse ni probarse, la migración RLS no se ha aplicado, y faltan el modelo transaccional por eventos, el ciclo de cuenta, la experiencia P0 completa y las pruebas en dispositivos.

## 2. Evidencia reproducible

**Baseline Git:** `main` en `8d5a1727ba60001fdd83f8b511dbede2b1f4d2a1`; todos los cambios de esta reauditoría permanecen en el worktree, sin commit ni push.
**Entorno local:** Windows 11 Pro 64-bit `10.0.26200`; Node `v24.14.0`; npm `11.18.0`. La CI propuesta fija Node `20.19.x` y aún no tiene ejecución remota.

| Control | Resultado observado |
|---|---|
| Instalación por lockfile | `npm ci` completado durante la estabilización |
| Sintaxis | 36 archivos válidos |
| Dependencias importadas | 100% declaradas |
| Tests automatizados | 23/23 aprobados |
| Expo Doctor | 18/18 checks aprobados |
| Export Android | aprobado; 945 módulos; bundle Hermes de 2.93 MB |
| Export iOS | aprobado; 947 módulos; bundle Hermes de 2.93 MB |
| Higiene del diff | `git diff --check` = 0 |
| Auditoría npm | 0 críticas, 0 altas, 13 moderadas y 1 baja |

Comando de gate ejecutado:

```bash
npm run check
```

El export iOS es un bundle JavaScript, no un binario firmado. La CI está versionada, pero su ejecución en GitHub deberá confirmarse después de publicar estos cambios.

## 3. Cambios cerrados

### Build y plataforma

- Dependencias alineadas con Expo SDK 54, React Native 0.81 y React 19.
- Navegación migrada a React Navigation 7 con Native Stack y Bottom Tabs.
- Eliminado el bootstrap que exigía una dependencia gestual no declarada.
- Supabase JS fijado en 2.106.2, versión que corrige la resolución React Native segura para Hermes.
- Web retirado del alcance MVP; Android e iOS son las plataformas objetivo.
- Fuentes reducidas a cuatro pesos de Inter y carga protegida contra pantalla vacía.

### Sesión y configuración

- `Main` solo se monta cuando existe una sesión válida.
- Registro sin sesión entra a un estado explícito de confirmación y ya no promete apertura automática.
- Logout global implementado.
- Adaptador implementado para migrar tokens de AsyncStorage a SecureStore mediante dos slots acotados, chunks medidos por bytes UTF-8 y limpieza de reinstalación.
- El cliente rechaza URL no HTTPS, host inesperado, `sb_secret_*` y JWT legacy en variables públicas.
- Falta de configuración produce una pantalla recuperable, no un fallo silencioso.

### Corrección de datos

- La fecha diaria se calcula con la zona civil disponible —hoy principalmente la del dispositivo—; existe una regresión automatizada para Panamá cuando UTC ya cambió de día.
- Inserts de hábitos y progreso consumen la fila confirmada por el servidor y no confunden un fallo de recarga con un fallo de escritura.
- El progreso se ordena por fecha y `created_at`.
- La racha legacy se retiró de la interfaz y del cliente hasta poder derivarla de eventos y programación reales.
- Cargas por foco se versionan para que una respuesta lenta no sobrescriba estado más reciente.

### Producto, UX y accesibilidad

- Navegación y pantallas reconstruidas alrededor de Compromiso, Disciplina, Evidencia y Cuenta.
- Estados de carga, error, vacío, reintento y acción ocupada son explícitos.
- Labels y estados `busy/disabled` permanecen disponibles al lector de pantalla.
- Tokens de texto y límites de controles tienen tests de contraste 4.5:1 y 3:1 respectivamente.
- Se retiraron afirmaciones de privacidad o persistencia que el backend todavía no puede demostrar.
- El benchmark, PRD, arquitectura y roadmap fijan hipótesis, límites y gates medibles.

### Entrega

- El workflow CI creado en el worktree está configurado para verificar sintaxis, imports, tests, Expo Doctor, bundles Android/iOS y vulnerabilidades críticas.
- README y `.env.example` documentan un entorno sin secretos.
- Existe una migración versionada de seguridad legacy que aborta ante policies desconocidas.

## 4. Trazabilidad frente a la auditoría inicial

| ID | Estado | Evidencia o deuda restante |
|---|---|---|
| HEX-001 | Cerrado | Dependencias alineadas; bundles Android/iOS aprobados |
| HEX-002 | Cerrado | Bootstrap gestual eliminado; Native Stack operativo |
| HEX-003 | No verificable | RLS remoto no inventariado ni probado A/B/anónimo |
| HEX-004 | Cerrado | `Main` depende de sesión; confirmación sin sesión vuelve a login |
| HEX-005 | Parcial | Se cerró el falso fallo por refetch; idempotencia/atomicidad objetivo pendientes |
| HEX-006 | Cerrado | Fecha civil con test específico de Panamá |
| HEX-007 | Parcial | SecureStore y logout global implementados; faltan fallos inyectados/reinstalación nativa |
| HEX-008 | Abierto | Recuperación, exportación, eliminación, retención y política pendientes |
| HEX-009 | Parcial | Contraste/roles/scroll mejorados; faltan VoiceOver, TalkBack, 200% y dispositivos |
| HEX-010 | Parcial | Tests/workflow/docs creados; faltan CI remota, RLS, integración y E2E |
| HEX-011 | Abierto | Sin IDs, firma, EAS ni assets finales |
| HEX-012 | Parcial | Navegación/tooling actualizados; quedan 13 avisos moderados y 1 bajo |
| HEX-013 | Cerrado | Recarga por foco versionada; racha legacy retirada |
| HEX-014 | Parcial | Validación/rangos/orden mejorados; falta modelo por eventos y paginación |
| HEX-015 | Cerrado | Polyfill, `processLock`, `AppState` y configuración temprana implementados |
| HEX-016 | Parcial | Safe areas, teclado y scroll cubiertos en flujos principales; matriz real pendiente |
| HEX-017 | Parcial | Error boundary existe; observabilidad/analítica redactada aún no |
| HEX-018 | Cerrado | Nombre técnico, copy, Inter y status bar normalizados; assets quedan bajo HEX-011 |
| HEX-019 | Abierto | Repositorio/licencia siguen sin decisión de gobernanza; `LICENSE` conserva el template Expo |

### Estado de gates

| Gate | Estado verificable |
|---|---|
| P0 Estrategia | Documentado; pendiente de aprobación humana y research |
| P1 Descubrimiento | Pendiente |
| T0 Build | Cerrado localmente; no equivale a Fase 0 completa ni CI remota |
| T1 Confianza | Bloqueado |
| C1 Core loop | Bloqueado |
| Q1 Beta | Bloqueado |
| V1 Valor | Sin evidencia de usuarios |
| R1 Público | Bloqueado |

## 5. Bloqueos que impiden beta

### P0 — frontera de datos

1. Recuperar acceso al Supabase de desarrollo y realizar backup.
2. Inventariar tablas, columnas, constraints, grants, policies, triggers y funciones reales.
3. Probar la migración primero en local/staging; no aplicarla a ciegas.
4. Ejecutar matriz usuario A / usuario B / anónimo para SELECT, INSERT, UPDATE y DELETE.
5. Crear el modelo objetivo por eventos, constraints de idempotencia y mutaciones atómicas.

El intento de introspección remota no resolvió DNS desde este entorno. Por ello no existe evidencia para afirmar que el backend actual está protegido ni operativo.

### P0 — confianza y ciclo de cuenta

- Recuperación de contraseña con callback seguro.
- Exportación completa y eliminación autenticada server-side.
- Reautenticación, revocación y prueba de cascadas tras borrar cuenta.
- Política de privacidad, retención, procesadores y canal de soporte.

### P0/P1 — producto ejecutable

- Onboarding que termine en 1–3 compromisos reales con acción mínima, frecuencia, señal y zona.
- Historial inmutable, consistencia, recuperación y revisión semanal.
- Estado offline/sync visible y reconciliación segura.
- Notificaciones opt-in después de que el usuario elija horario.
- Instrumentación redactada para activación, D7 y SEC Rate.

### Gate de calidad/release

- Tests de repositorio, auth, RLS, almacenamiento con fallos inyectados y E2E.
- VoiceOver, TalkBack, texto al 200%, reduce motion y matriz de dispositivos.
- IDs iOS/Android, versionado nativo, `eas.json`, icono/splash finales y builds firmados.
- Observabilidad sin PII, runbooks, rollback y auditoría legal/claims.

## 6. Riesgo de dependencias

`npm audit` reporta 14 avisos transitivos: 13 moderados y 1 bajo; no hay altos ni críticos. La corrección automática propuesta requiere saltar fuera de Expo SDK 54, así que no se aplicó sin una migración planificada y validación de compatibilidad. El gate CI bloquea vulnerabilidades críticas; antes de release se deberá revisar nuevamente el árbol y la versión soportada de Expo.

## 7. Próximo orden de ejecución

1. Cerrar acceso, inventario, backup, staging y pruebas RLS.
2. Implementar el esquema objetivo y repositorios transaccionales.
3. Construir el onboarding P0 y el core loop vertical completo.
4. Añadir recuperación/exportación/eliminación y privacidad operativa.
5. Completar offline, revisión semanal, recordatorios y observabilidad.
6. Ejecutar QA nativo, accesibilidad manual y builds firmados.
7. Abrir beta privada solo si T1, C1 y Q1 tienen evidencia.

| Próxima salida | Owner recomendado | Evidencia para cerrar |
|---|---|---|
| Backend seguro reproducible | Backend/Data + AppSec | Backup, migración staging y matriz RLS A/B/anónimo |
| Core loop ejecutable | Product + Mobile Tech Lead | HEX-P02–P07 trazados a tests y journey completo |
| Ciclo de cuenta | Auth + Privacy | Reset/export/delete y sesión posterior rechazada |
| Beta accesible | QA + Accessibility | E2E, device matrix, VoiceOver/TalkBack y texto 200% |
| Distribución | Release Engineer | IDs, assets, firma y builds internos instalados |
| Gobernanza | CTO + Legal | Visibilidad y licencia aprobadas por escrito |

## 8. Declaración de verdad

No hay evidencia suficiente para afirmar que HEXIS sea “la mejor app de progreso personal jamás creada”. Sí existe una tesis diferenciada, un benchmark documentado, una especificación verificable y una base técnica que vuelve esa ambición evaluable. La superioridad deberá demostrarse con usuarios, seguridad real, accesibilidad y métricas previamente definidas, no declararse por diseño.
