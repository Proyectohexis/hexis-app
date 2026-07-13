# Informe de auditoría integral — Proyecto Hexis

**Fecha:** 11 de julio de 2026
**Repositorio:** `Proyectohexis/hexis-app`
**Rama / commit auditado:** `main` / `8d5a1727ba60001fdd83f8b511dbede2b1f4d2a1`
**Coordinación:** `web-agency-operating-system`
**Departamentos activos:** División de Aplicaciones, Ingeniería, Ciberseguridad/Privacidad, QA y Auditoría/Excelencia
**Roles activados:** Technical Audit Specialist, Security & Privacy Audit Liaison, App QA Lead y Truth Auditor

## 1. Veredicto ejecutivo

**Gate global: BLOQUEADO / NO-GO para producción, beta externa o QA de release.**

HEXIS tiene una base de prototipo comprensible y una experiencia enfocada en hábitos, rachas y progreso físico. Sin embargo, el estado auditado no cumple el estándar senior de entrega por tres razones decisivas:

1. **No se puede generar un bundle limpio:** `npm ci` termina, pero Android falla porque el código importa paquetes no declarados; web falla porque faltan sus dependencias de plataforma.
2. **La seguridad server-side no es verificable:** el cliente accede directamente a Supabase y el repositorio no contiene esquema, migraciones ni políticas RLS. No hay evidencia suficiente para afirmar que los datos de usuarios estén aislados correctamente.
3. **No existe un gate de calidad/release:** hay cero tests, cero CI, cero migraciones SQL, documentación mínima, assets de plantilla y ausencia de configuración de distribución.

Esto no significa que la idea o todo el código sean descartables. Significa que el proyecto está en fase de **prototipo funcional temprano**, no en fase de producto listo para usuarios reales.

### Resumen de severidad

| Severidad | Cantidad | Estado |
|---|---:|---|
| Crítico confirmado | 1 | Bloquea build |
| Crítico condicionado / no verificable | 1 | Bloquea seguridad hasta obtener evidencia |
| Alto | 9 | Bloquea QA/release |
| Medio | 7 | Debe entrar al plan antes de beta |
| Bajo | 1 grupo | Deuda de acabado y consistencia |

No existe una fecha de release ni responsables nominales aprobados. Por integridad, este informe no inventa fechas calendario: asigna **roles responsables provisionales** y un **gate límite**. Dirección/Project Management debe convertirlos en nombres y fechas antes de iniciar la remediación.

## 2. Qué es la app

HEXIS es una app Expo/React Native de hábitos y transformación personal. Usa autenticación email/contraseña y Supabase como backend.

### Mapa funcional verificado

```text
Inicio
└─ Validación de sesión Supabase
   ├─ Sin sesión
   │  ├─ Bienvenida → selección de meta → registro con nombre
   │  └─ Login ↔ registro alternativo
   └─ Con sesión
      └─ Navegación inferior
         ├─ Inicio: nombre, racha y progreso diario
         ├─ Hábitos: alta, marcado diario y actualización de racha
         └─ Progreso: peso, notas e historial
```

### Arquitectura observada

- **Cliente:** Expo SDK 54, React 19.1 y React Native 0.81.5.
- **Navegación:** React Navigation 6 con stack y bottom tabs.
- **Backend:** Supabase Auth + Data API.
- **Entidades implícitas:** `habits`, `streaks` y `progress`.
- **Estado:** local por pantalla; no hay cache compartida ni store global.
- **Diseño:** tema oscuro con tokens de color, tipografía y espaciado.
- **Plataformas declaradas:** Android, iOS y web mediante scripts; la configuración real de release no está completa.

No existen pantallas de perfil, ajustes, cierre de sesión, recuperación de contraseña, privacidad, exportación o eliminación de cuenta.

## 3. Alcance y método

Se revisaron:

- 37 archivos versionados, incluidos 20 archivos JavaScript y 1.169 líneas JS.
- `package.json`, `package-lock.json`, `app.json`, `.env.example`, `.gitignore`, historial Git y documentación.
- Todos los flujos, consultas y mutaciones de Supabase visibles en el cliente.
- Contraste matemático de la paleta y semántica accesible declarada.
- Assets de launcher, splash y favicon.
- Historial de `.env` y patrones de claves sensibles sin revelar valores.

Se ejecutaron instalación limpia, análisis sintáctico, Expo Doctor, validación de compatibilidad, bundles Android/web y SCA de dependencias. No se cambió código funcional.

### Evidencia de ejecución

| Prueba | Resultado |
|---|---|
| `npm ci` sobre `package-lock.json` | **Aprobada:** 742 paquetes instalados |
| Sintaxis con Node | **Aprobada:** 20/20 archivos JS |
| `expo-doctor --verbose` | **17/18:** Expo bloqueado en `54.0.34`; esperado `~54.0.35` |
| `expo install --check` | **Falló:** patch de Expo desactualizado |
| Bundle Android | **Falló:** no se puede resolver `expo-splash-screen` desde `App.js` |
| Bundle web | **Falló:** faltan `react-dom@19.1.0` y `react-native-web@^0.21.0` |
| Tests automatizados | **No existen** |
| Workflows CI / `eas.json` | **No existen** |
| Migraciones/SQL/RLS versionados | **No existen** |
| SCA (`npm audit --omit=dev`) | 15 módulos afectados: 1 alto, 13 moderados, 1 bajo, 0 críticos |
| Contraste de CTA crema/dorado | **1.91:1**, falla WCAG AA |
| Contraste texto terciario/tarjeta | **2.68:1**, falla WCAG AA |

## 4. Fortalezas verificadas

- La estructura `screens / navigation / lib / theme` es pequeña y fácil de recorrer.
- Expo 54, React 19.1 y React Native 0.81.5 están alineados a nivel mayor/menor.
- Los tokens de color, espaciado y tipografía están centralizados.
- El listener de autenticación se desuscribe correctamente.
- Las lecturas principales filtran por `user_id` desde el usuario actual.
- Hay indicadores de carga y reintento para lecturas iniciales de hábitos/progreso.
- Se usa `secureTextEntry` para contraseñas.
- `.env` actual no está versionado; `.env.example` contiene placeholders.
- El historial no mostró `service_role`, `sb_secret_` ni claves privadas. El `.env` histórico contenía solo URL y clave publicable; eso no es un secreto server-side.
- El dashboard ofrece orientación básica cuando no existen hábitos.
- No hay permisos móviles, publicidad o tracking invasivo declarados.

## 5. Hallazgos prioritarios

### HEX-001 — Crítico — El manifiesto no satisface los imports y el bundle falla

**Evidencia:** `App.js:3-10` importa `expo-font`, `expo-splash-screen` y `@expo-google-fonts/inter`; `src/navigation/AppNavigator.js:6` importa `@expo/vector-icons`. Ninguno está declarado como dependencia raíz en `package.json:11-23`. El bundle Android reproducido falla en `App.js:4` al resolver `expo-splash-screen`. Web falla antes de bundlear porque faltan `react-dom` y `react-native-web`.

**Impacto:** no se puede producir una entrega instalable desde un clon limpio.

**Corrección requerida:** declarar cada import directo con `expo install`, decidir si web es plataforma real, actualizar Expo al patch esperado y repetir builds limpios. Si las fuentes no se usarán, eliminar el loader en lugar de añadir deuda.

**Responsable provisional:** Mobile Tech Lead.
**Gate límite:** antes de cualquier QA funcional.
**Evidencia de cierre:** `npm ci`, `expo-doctor`, `expo install --check` y bundles Android/iOS/web aplicables terminan en cero.

### HEX-002 — Alto — Bootstrap incompleto de `react-native-gesture-handler`

**Evidencia:** `index.js:1-8` no inicializa gesture-handler, mientras `AppNavigator.js:2` usa `@react-navigation/stack`. React Navigation 6 advierte que omitir el import inicial puede causar crash en producción nativa aunque desarrollo funcione.

**Corrección requerida:** aplicar el bootstrap nativo/web recomendado como primer import o migrar de forma planificada a `native-stack`.

**Responsable provisional:** Mobile Tech Lead.
**Gate límite:** antes del primer build release.
**Evidencia de cierre:** smoke test release Android/iOS con navegación y gestos.

### HEX-003 — Crítico condicionado / no verificable — Aislamiento entre usuarios depende de RLS no versionado

**Evidencia:** `src/lib/habits.js`, `progress.js` y `streaks.js` llaman directamente la Data API. `toggleHabit` actualiza solo por `id` (`habits.js:22-31`) y las inserciones aceptan `userId` desde el cliente. No existen migraciones, SQL, grants, policies ni evidencia de RLS.

**Verdad auditada:** no tengo evidencia suficiente para afirmar que RLS esté ausente; puede existir manualmente en Supabase. Tampoco hay evidencia para aprobarlo. Si RLS falta o está mal configurado, existe riesgo de lectura/escritura horizontal de hábitos, peso, notas y rachas.

**Corrección requerida:** versionar esquema/migraciones, habilitar RLS, políticas `auth.uid() = user_id`, `WITH CHECK`, FKs, constraints, índices y pruebas A/B/anónimo. Mover operaciones atómicas a RPC/función server-side.

**Responsable provisional:** App Data Architect + App Security Engineer.
**Gate límite:** antes de conectar usuarios o datos reales.
**Evidencia de cierre:** exportación de `pg_policies`, pruebas negativas entre dos usuarios y Supabase Security Advisor sin hallazgos abiertos no aceptados.

### HEX-004 — Alto — Registro puede abrir `Main` sin sesión válida

**Evidencia:** `NameScreen.js:20-46` comprueba `data.user`, no `data.session`, intenta escribir `streaks` y hace reset a `Main`. `AppNavigator.js:106-114` incluye `Main` dentro de la rama no autenticada. `RegisterScreen.js:13-24` es un segundo flujo divergente que no maneja confirmación de email.

**Impacto:** con confirmación de correo activa, puede existir usuario sin sesión; el cliente mostraría una app aparentemente autenticada con consultas/escrituras fallidas.

**Corrección requerida:** modelar `signed_out`, `pending_email_confirmation` y `signed_in`; proteger `Main` solo por sesión; consolidar un único alta; crear datos iniciales tras autenticar o mediante trigger seguro.

**Responsable provisional:** Auth Engineer + Mobile Tech Lead.
**Gate límite:** antes de QA de autenticación.
**Evidencia de cierre:** E2E con confirmación activa/inactiva, correo duplicado, enlace vencido y offline.

### HEX-005 — Alto — Mutaciones comunican éxito aunque el servidor falle

**Evidencia:** se ignoran errores de `toggleHabit`, `createHabit`, `addProgress`, actualizaciones de racha y el `upsert` de onboarding (`HabitsScreen.js:40-54`, `ProgressScreen.js:51-58`, `streaks.js:14-44`, `NameScreen.js:34-46`).

**Impacto:** la UI puede marcar hábitos, borrar inputs o mostrar rachas que nunca se persistieron.

**Corrección requerida:** propagar errores, conservar inputs, revertir optimismo, diferenciar “sin fila” de error real, usar `try/finally` y transacciones/RPC para rachas.

**Responsable provisional:** Mobile Tech Lead + Backend/Supabase Engineer.
**Gate límite:** antes de QA funcional.
**Evidencia de cierre:** casos offline, timeout, 401 y 500 sin éxito falso ni pérdida de entrada.

### HEX-006 — Alto — El día cambia a las 19:00 en Panamá

**Evidencia:** `habits.js:4,23` y `streaks.js:13,26-28` usan `toISOString().split('T')[0]`. Prueba reproducida: `2026-07-12T00:30:00Z` corresponde a `2026-07-11 19:30` en Panamá, pero el código produce `2026-07-12`.

**Impacto:** hábitos nocturnos pueden atribuirse al día siguiente y la racha resetearse cinco horas antes de medianoche.

**Corrección requerida:** definir política explícita de zona horaria y fecha civil; preferir cálculo server-side/transaccional.

**Responsable provisional:** Domain/Data Engineer.
**Gate límite:** antes de QA de rachas.
**Evidencia de cierre:** reloj simulado alrededor de 19:00 y 00:00 en Panamá, cambio de zona y concurrencia.

### HEX-007 — Alto — Tokens persistidos en almacenamiento no cifrado y sin logout accesible

**Evidencia:** `supabase.js:1,7-12` usa AsyncStorage con `persistSession: true`. React Native documenta AsyncStorage como almacenamiento no cifrado y desaconseja usarlo para tokens. `auth.js:8-10` implementa `signOut`, pero ninguna pantalla lo expone.

**Impacto:** extracción local en dispositivo comprometido y sesión persistente que el usuario no puede cerrar desde la app.

**Corrección requerida:** adoptar Keychain/Keystore mediante un adaptador probado, añadir logout, política de sesión y reautenticación proporcional al riesgo.

**Responsable provisional:** Mobile AppSec Engineer.
**Gate límite:** antes de beta externa.
**Evidencia de cierre:** inspección de sandbox y prueba de revocación/borrado tras logout.

### HEX-008 — Alto — No existe ciclo de privacidad para datos personales

**Evidencia:** se recopilan nombre, email, meta, hábitos, fechas, peso y notas. No existen aviso de privacidad, finalidad, retención, exportación, eliminación de cuenta ni funciones de borrado.

**Impacto:** riesgo de confianza, soporte y cumplimiento. Peso/notas pueden revelar información de salud o bienestar.

**Corrección requerida:** inventario de datos/finalidades, aviso previo, retención, exportación, eliminación autenticada y revisión legal según mercado, audiencia y edad objetivo.

**Responsable provisional:** Privacy Engineer + Legal Advisor + Backend Engineer.
**Gate límite:** antes de usuarios reales.
**Evidencia de cierre:** E2E de exportación/eliminación y política aprobada. No se declara cumplimiento legal hasta esa revisión.

### HEX-009 — Alto — Accesibilidad insuficiente

**Evidencia:** texto crema `#F0EDE6` sobre dorado `#C9A96E` da **1.91:1**; texto terciario sobre tarjeta da **2.68:1**, por debajo de 4.5:1 para texto normal. No se encontraron `accessibilityRole`, `accessibilityState`, labels, hints ni anuncios. Selector de meta y hábitos comunican estado solo visualmente.

**Corrección requerida:** usar texto inverso oscuro sobre dorado, elevar contraste terciario/bordes, añadir nombre/rol/estado y probar VoiceOver/TalkBack.

**Responsable provisional:** Accessibility Designer + Mobile UI Engineer.
**Gate límite:** antes de QA visual/accesible.
**Evidencia de cierre:** matriz WCAG AA + pruebas reales de lector de pantalla y texto ampliado.

### HEX-010 — Alto — No hay pruebas, CI, backend reproducible ni documentación operativa

**Evidencia:** `package.json:5-9` solo tiene scripts de ejecución; hay cero tests, cero workflows CI, cero SQL/migraciones y `README.md` tiene dos líneas.

**Impacto:** no existe red para prevenir regresiones ni forma documentada de reconstruir Supabase, ejecutar QA o hacer handoff.

**Corrección requerida:** README operativo, migraciones/seeds/RLS, lint, tests unitarios/integración/E2E, CI y matriz de plataformas.

**Responsable provisional:** QA Automation Lead + DevOps + Documentation Specialist + Data Engineer.
**Gate límite:** antes de aceptar nuevas funcionalidades de riesgo.
**Evidencia de cierre:** una persona nueva provisiona el entorno y CI ejecuta todos los gates desde un clon limpio.

### HEX-011 — Alto — Release e identidad visual incompletos

**Evidencia:** `app.json` no define `ios.bundleIdentifier`, `android.package`, build numbers ni perfiles EAS. Icono y splash son cuadrículas de plantilla; favicon conserva marca Expo. No existe `eas.json`.

**Impacto:** no hay artefacto publicable ni identidad profesional.

**Corrección requerida:** assets finales, identificadores, versionado, perfiles por ambiente, signing, rollback y smoke tests de distribución.

**Responsable provisional:** Brand Designer + Mobile Build Engineer + Release Manager.
**Gate límite:** antes de beta distribuible.
**Evidencia de cierre:** previews y builds reales iOS/Android sin placeholders.

## 6. Hallazgos medios

| ID | Hallazgo | Evidencia principal | Acción | Responsable / gate |
|---|---|---|---|---|
| HEX-012 | Dependencias fuera de soporte y SCA abierto | React Navigation 6 directo está deprecado. `npm audit`: 1 alto, 13 moderados, 1 bajo; el alto (`undici`) llega por tooling de Expo. No se demostró exposición en el bundle final. | Actualizar primero dentro de SDK 54, evaluar salto de Navigation, no ejecutar `audit fix --force` sin regresión. | Dependency Manager / antes de release |
| HEX-013 | Dashboard y racha quedan obsoletos | `DashboardScreen.js:14-34` carga solo al montar; Hábitos muta en otra tab. `HabitsScreen` no carga la racha existente. | `useFocusEffect` o cache compartida con invalidación. | State Management Engineer / antes de QA funcional |
| HEX-014 | Modelo/validación de datos débiles | `parseFloat` sin `Number.isFinite`/rango, strings sin límites, `select('*')`, progreso sin paginación, completado diario sobrescribe historial. | Validación cliente+DB, columnas explícitas, límites, tabla `habit_completions`, paginación. | Data Architect / antes de beta |
| HEX-015 | Integración Supabase RN incompleta | Falta `react-native-url-polyfill`, `processLock` y ciclo `AppState` para auto-refresh. Variables ausentes hacen que `createClient` lance `supabaseUrl is required`. | Adoptar patrón oficial y validación temprana de configuración. | Auth Engineer / antes de QA auth |
| HEX-016 | Safe area, teclado y responsive no cubiertos | Formularios sin `KeyboardAvoidingView`/scroll; paddings fijos; tablet habilitada y web declarada sin diseño responsivo. | Definir plataformas y probar cutouts, teclado, tablet, web y Dynamic Type. | Mobile UX/UI / antes de QA visual |
| HEX-017 | Sin observabilidad ni medición | Solo existe un `console.log`; no hay error boundary, crash reporting, eventos ni release tagging. | Telemetría redactada, eventos mínimos y alertas. | Observability + Product Data / antes de beta |
| HEX-019 | Repositorio público sin decisión de gobernanza | GitHub expone el código públicamente. La política del sistema de agencia trata código propietario como privado por defecto. | Confirmar por escrito si será open source; si es propietario, cambiar visibilidad y revisar licencia/historial. | CTO + Legal / antes de añadir propiedad intelectual sensible |

## 7. Deuda baja y acabado

**HEX-018 — Bajo:** identidad técnica inconsistente (`hexis-app2`, `hexis-app`, `HEXIS`), textos españoles sin acentos en auth, fechas crudas, `expo-status-bar` no usado, Inter se carga pero ningún estilo aplica `fontFamily`, y `Satoshi` se declara sin asset.

## 8. Inconsistencias de producto

- La meta se selecciona y guarda, pero ninguna pantalla la usa; Dashboard muestra un propósito fijo.
- El registro alternativo omite la meta y produce un perfil distinto.
- Los hábitos iniciales siempre son Entrenamiento, Lectura y Meditación, sin depender de la meta.
- No hay logout, recuperación de contraseña, perfil ni gestión de cuenta.
- El dashboard no distingue fallo de backend de “cero datos”.
- El historial de hábitos no es reconstruible porque solo se conserva la última fecha por hábito.

## 9. Matriz mínima de pruebas requerida

1. **Build:** instalación limpia y bundles release Android/iOS; web solo si sigue en alcance.
2. **Auth:** confirmación activa/inactiva, duplicado, contraseña débil, enlace vencido, offline, logout y restauración.
3. **RLS:** usuario A/B/anónimo para CRUD de las tres tablas.
4. **Mutaciones:** offline, timeout, 401, 500, doble toque y concurrencia sin éxito falso.
5. **Fechas:** 18:59/19:00 y 23:59/00:00 Panamá; cambio de zona; reloj manipulado.
6. **Rachas:** completar/desmarcar, nuevo hábito, varios dispositivos e idempotencia.
7. **Navegación:** refresco entre tabs y protección de rutas.
8. **Validación:** coma decimal, `NaN`, negativos, extremos y strings largos.
9. **Accesibilidad:** contraste, VoiceOver, TalkBack, targets táctiles, texto al 200 % y estados anunciados.
10. **Dispositivos:** teléfono pequeño, cutout, Android/iOS, tablet si permanece soportada.
11. **Privacidad:** exportación, eliminación, retención y revocación de sesión.
12. **Release:** assets, identificadores, signing, rollback, observabilidad y smoke test.

## 10. Plan de remediación por gates

### Gate 0 — Recuperar un build confiable

- Corregir HEX-001 y HEX-002.
- Actualizar Expo `54.0.34` → patch esperado por SDK 54.
- Decidir si web sigue en alcance.
- Repetir Expo Doctor y bundles limpios.

### Gate 1 — Asegurar identidad, datos y lógica diaria

- Cerrar HEX-003 a HEX-008.
- Versionar Supabase y probar RLS.
- Unificar auth/onboarding.
- Propagar errores y mover rachas a una operación atómica.
- Definir zona horaria y privacidad.

### Gate 2 — Establecer calidad de producto

- Corregir accesibilidad, estado compartido, validación y responsive.
- Añadir tests, CI, documentación y observabilidad.
- Hacer QA funcional, regresión y dispositivo.

### Gate 3 — Preparar release

- Assets e identificadores finales.
- EAS/build/signing/rollback.
- Cerrar vulnerabilidades altas o aceptar riesgo formalmente.
- Auditoría final de seguridad, privacidad, accesibilidad y completitud.

## 11. Verificado vs. no verificado

### Verificado

- Código, imports, dependencias y scripts versionados.
- Fallos reales de bundle Android y web.
- Expo Doctor 17/18 y patch mismatch.
- Ausencia de tests, CI, migraciones, RLS versionado y runbook.
- Contraste matemático y ausencia de props accesibles.
- Assets de plantilla.
- SCA actual del lockfile.
- `.env` histórico con URL/clave publicable, sin patrón de secreto server-side.

### No verificado

- RLS, grants, triggers, constraints y configuración Auth en el proyecto Supabase remoto.
- Comportamiento visual/dinámico en dispositivos, porque el build está bloqueado.
- iOS release desde este entorno Windows.
- Rendimiento, consumo de memoria, crash-free rate, offline real y carga a escala.
- Cumplimiento legal o regulatorio.
- Estado de backups, retención, región y borrado server-side.

## 12. Evidencia externa oficial

- [Expo SDK 54](https://docs.expo.dev/versions/v54.0.0/)
- [Expo Font SDK 54](https://docs.expo.dev/versions/v54.0.0/sdk/font/)
- [Expo SplashScreen SDK 54](https://docs.expo.dev/versions/v54.0.0/sdk/splash-screen/)
- [Variables de entorno Expo](https://docs.expo.dev/guides/environment-variables/)
- [React Navigation Stack 6.x](https://reactnavigation.org/docs/6.x/stack-navigator/)
- [Supabase Auth para React Native](https://supabase.com/docs/guides/auth/quickstarts/react-native)
- [Supabase Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [React Native Security](https://reactnative.dev/docs/security)
- [React Native Accessibility](https://reactnative.dev/docs/accessibility)
- [WCAG 2.2 — Contraste mínimo](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html)
- [OWASP MASVS](https://mas.owasp.org/MASVS/)

Advisories principales detectados: [undici](https://github.com/advisories/GHSA-vxpw-j846-p89q), [PostCSS](https://github.com/advisories/GHSA-qx2v-qp2m-jg93), [uuid](https://github.com/advisories/GHSA-w5hq-g745-h8pq), [tar](https://github.com/advisories/GHSA-vmf3-w455-68vh), [js-yaml](https://github.com/advisories/GHSA-h67p-54hq-rp68) y [Babel](https://github.com/advisories/GHSA-4x5r-pxfx-6jf8).

## 13. Handoff

**Decisión:** no continuar a QA de release ni producción.
**Siguiente departamento:** Ingeniería + App Data/Security.
**Primer responsable:** Mobile Tech Lead para recuperar build; en paralelo App Data Architect/Security debe exportar y versionar el backend Supabase.
**Próxima auditoría:** cuando Gate 0 y Gate 1 estén cerrados con evidencia reproducible.
