# Estrategia de producto y PRD — HEXIS

**Versión:** 1.0
**Fecha:** 11 de julio de 2026
**Estado:** propuesta estratégica documentada; pendiente de aprobación de Product Owner y validación con usuarios.
**Plataformas MVP:** teléfonos iOS y Android.
**Idioma inicial:** español, con arquitectura preparada para i18n.

## 1. Resultado buscado

HEXIS ayuda a adultos autodirigidos a convertir una intención de identidad en pocos compromisos diarios, registrar evidencia de ejecución y revisar si esas acciones sostienen una transformación medible.

No se declarará “la mejor app jamás creada”, “científicamente probada”, terapéutica ni capaz de garantizar resultados. La ambición medible es ser la mejor opción para un segmento concreto y demostrarlo mediante activación, continuidad, recuperación, confianza y resultados reportados por usuarios.

## 2. Segmento inicial

### Usuario principal

Adulto de 18 años o más que:

- tiene una meta seria de cambio, inicialmente asociada a disciplina física o hábitos fundacionales;
- ya probó listas, trackers, notas o fitness apps, pero pierde continuidad o divide su proceso entre varias herramientas;
- rechaza mascotas, monedas, mensajes condescendientes y estética infantil;
- acepta registrar acciones y, opcionalmente, una métrica de progreso;
- busca una herramienta privada y sobria, no terapia ni prescripción.

**Hipótesis beachhead:** adulto hispanohablante que desea sostener entrenamiento y hábitos asociados, y medir una señal física opcional como peso o perímetro. Debe validarse antes de ampliar el producto.

### Usuarios posteriores, fuera del MVP

- Personas con metas de estudio, enfoque profesional o práctica creativa.
- Coaches y círculos privados de accountability.
- Usuarios que desean guía personalizada por IA.

### Exclusiones iniciales

- Menores de edad.
- Atención clínica, diagnóstico, terapia o prescripción.
- Gestión de trastornos alimentarios, adicciones o salud mental.
- Programas empresariales, escuelas o comunidades públicas.

## 3. Jobs to Be Done

### Funcional

> Cuando decido cambiar una parte de mi vida, quiero traducir esa intención en pocas acciones concretas, registrarlas sin fricción y revisar su efecto para saber si estoy convirtiéndome en la persona que decidí ser.

### Emocional

> Quiero que la herramienta respete mi ambición y mi inteligencia, sin tratarme como un niño ni castigarme cuando pierdo continuidad.

### Confianza

> Quiero saber qué datos guarda HEXIS, poder exportarlos o borrarlos y confiar en que nadie más puede acceder a ellos.

### Recuperación

> Cuando fallo, quiero entender qué ocurrió y reanudar el proceso sin que un número borre toda la evidencia anterior.

## 4. Posicionamiento y promesa

> Para adultos que se toman en serio su transformación, HEXIS es un sistema premium de disciplina personal que convierte compromisos diarios en evidencia visible de identidad. A diferencia de los trackers gamificados o las apps de fitness aisladas, une compromiso, práctica y transformación en una experiencia sobria, privada y medible.

- **Categoría de entrada:** hábitos y progreso personal.
- **Diferenciador:** identidad + disciplina + evidencia.
- **Tono:** directo, sereno y exigente; nunca clínico ni punitivo.
- **Promesa permitida:** ayudar a estructurar, registrar y revisar un proceso.
- **Promesas prohibidas:** garantizar transformación, pérdida de peso, mejora clínica o bienestar mental.

## 5. Principios de producto

1. **Acción antes que contenido.** La primera sesión termina en un compromiso ejecutable.
2. **Evidencia antes que celebración.** “Registrado. Día 7.”, no elogio vacío.
3. **Recuperación antes que castigo.** Fallar no borra la trayectoria.
4. **Menos compromisos, mejor ejecutados.** Empezar con 1–3 hábitos.
5. **La racha es secundaria.** Siempre acompañada por consistencia e historial.
6. **Privacidad es una función central.** Exportar y borrar nunca serán Premium.
7. **Premium debe ser accesible.** Marca oscura sin sacrificar contraste o tamaño.
8. **El día pertenece al usuario.** Se usa fecha civil y zona horaria explícita.
9. **No optimizar minutos en pantalla.** El valor ocurre fuera de la app.
10. **Sin claims clínicos.** HEXIS estructura y refleja; no diagnostica ni prescribe.
11. **Cualquier score debe ser explicable.** El usuario puede reconstruirlo.
12. **La ausencia de datos se comunica.** Nunca se inventa una conclusión.

## 6. Modelo conceptual

### Los tres pilares

| Pilar | Pregunta | Producto |
|---|---|---|
| Compromiso | ¿Quién decidí ser y por qué? | Identidad, meta, plan y protocolo mínimo |
| Disciplina | ¿Qué evidencia crearé hoy? | Hábitos programados, check-in y reentrada |
| Transformación | ¿Qué cambió y qué debo ajustar? | Historial, métricas opcionales y revisión semanal |

### Core loop diario

```text
Recordatorio elegido
      ↓
Compromisos aplicables hoy
      ↓
Check-in en ≤60 segundos
      ↓
Sincronizado / pendiente / error
      ↓
Evidencia acumulada de identidad
```

### Core loop semanal

```text
Plan activo
   ↓
Acciones registradas
   ↓
Resumen de consistencia + transformación
   ↓
Reflexión breve
   ↓
Mantener / reducir / aumentar / sustituir
```

La revisión semanal es parte del producto central, no contenido decorativo.

## 7. North Star y métricas

### North Star Metric: Tasa de Semanas de Evidencia Cerradas (SEC Rate)

Una semana elegible cuenta como cerrada cuando el usuario:

1. tuvo un plan activo con al menos una fecha programada y suficiente tiempo para ejecutarlo;
2. registró una acción en `min(3, fechas programadas de la semana)` fechas civiles programadas distintas; y
3. completó la revisión semanal.

```text
SEC Rate =
usuarios elegibles que cerraron la semana
÷ usuarios elegibles con plan activo
```

La elegibilidad exacta, el corte temporal y la fórmula se congelarán como `metric_version` antes de beta. Tres fechas es un máximo inicial, no un mínimo universal: un plan legítimo de dos días requiere sus dos días y nunca será penalizado por no programar tres.

### Activación

Un usuario se activa dentro de 24 horas cuando:

- define identidad/meta;
- crea un plan de 1–3 compromisos; y
- registra su primera ejecución real.

Crear cuenta o permitir notificaciones no cuenta como activación.

### Umbrales de aprendizaje para beta

Son objetivos, no resultados actuales:

- Finalización de onboarding ≥65%.
- Activación en 24 horas ≥50%.
- Tiempo mediano de onboarding ≤4 minutos.
- Retención D7 de activados ≥35%.
- SEC Rate en semana 2 ≥30%.
- Sesiones sin crash ≥99.5%.

### Métricas secundarias

- D1, D7 y D30 de usuarios activados.
- SEC Rate en semana 2 y semana 4.
- Fechas distintas con evidencia por usuario activo.
- Revisiones semanales completadas.
- Porcentaje que ajusta el plan después de revisar.
- Retorno después del primer día programado perdido.
- Consistencia 7/30 días y mejor continuidad.

### Guardrails

- Cero accesos cruzados entre usuarios en pruebas RLS.
- Cero mensajes de éxito confirmado si persistir/encolar falló.
- Operaciones no resueltas <0.5% con red estable.
- Logout, exportación y eliminación pasan el 100% de casos de aceptación.
- Flujos P0 navegables con VoiceOver/TalkBack y texto al 200%.
- Máximo predeterminado de dos notificaciones diarias, siempre configurables.
- Medir culpa/presión después de una interrupción.
- No usar como North Star minutos en app, notificaciones enviadas o aperturas inducidas.

### Taxonomía analítica permitida

Eventos iniciales del MVP:

- `onboarding_started`
- `identity_defined`
- `plan_created`
- `checkin_recorded`
- `checkin_sync_failed`
- `weekly_review_completed`
- `plan_adjusted`
- `export_requested`
- `account_deleted`

Eventos reservados para una fase post-MVP de monetización:

- `paywall_viewed`
- `subscription_started`

Nunca enviar a analítica: email, nombre, texto de identidad, nombre de hábitos, notas, peso, fotografías o valores físicos.

## 8. Alcance del MVP

### Incluido

- iOS y Android para teléfonos.
- Español e infraestructura i18n.
- Autenticación, confirmación, recuperación, logout y revocación.
- Onboarding de identidad, meta y 1–3 compromisos.
- Hábitos recurrentes con fechas de ejecución separadas.
- Vista Hoy y check-in de uno o dos toques.
- Historial, racha explicable, consistencia y recuperación.
- Una métrica opcional de transformación.
- Revisión semanal y ajuste del plan.
- Recordatorios controlados por el usuario.
- Perfil, zona horaria, unidades y preferencias.
- Estados offline/sincronización visibles.
- Exportación y eliminación de cuenta.
- Analítica redactada, observabilidad y soporte básico.
- Accesibilidad AA y QA en dispositivos reales.

### P1 después de validar retención

- Hábitos cuantitativos.
- Varias métricas de transformación.
- Programas editoriales.
- Comparación entre ciclos.
- Widgets.
- Inglés completo.
- HealthKit y Health Connect.
- Evidencia fotográfica con privacy review propio.

### No-objetivos del MVP

- Web, desktop, tablet optimizada o wearables.
- Coach IA o chat abierto.
- Comunidad, feed, ranking o mensajería.
- Fotografías corporales.
- Planes de ejercicio, dieta, calorías o prescripción.
- Marketplace o hexislife.com.
- Mascotas, monedas, XP, loot, badges o streak repair pagado.
- Monetización antes de demostrar el core loop.

## 9. Requisitos funcionales

### HEX-P01 — Autenticación y sesión

**Prioridad:** P0

- Un único flujo de registro.
- Estados `signed_out`, `pending_confirmation` y `signed_in`.
- `Main` solo existe con sesión válida.
- Login, confirmación, recuperación, logout y revocación.
- Tokens en Keychain/Keystore.

**Aceptación:**

- Con confirmación activa, un usuario sin sesión nunca entra a Main.
- Enlace vencido, duplicado, credenciales incorrectas y offline muestran estados distintos.
- Logout borra credenciales locales y vuelve a auth.
- E2E cubre restauración y revocación.

### HEX-P02 — Compromiso inicial

**Prioridad:** P0

- Identidad objetivo, meta prioritaria y motivo.
- Entre uno y tres hábitos; plantillas editables.
- Frecuencia, inicio, zona horaria y recordatorio.
- Resumen editable antes de confirmar.

**Aceptación:**

- No se crean por defecto Entrenamiento, Lectura y Meditación.
- No existe un registro alternativo que omita la meta.
- La identidad/meta reaparece en Inicio y Revisión.
- No se promete un resultado inevitable.

### HEX-P03 — Modelo de hábitos

**Prioridad:** P0

- Crear, editar, pausar, archivar y reactivar.
- Frecuencia diaria o días seleccionados.
- Cada ejecución es un registro separado.
- Idempotencia por usuario, hábito y fecha civil.

**Aceptación:**

- El historial se reconstruye por completo.
- Doble toque o dos dispositivos no duplican.
- Descansos y días no programados no rompen continuidad.
- Las mutaciones propagan errores y preservan el input.

### HEX-P04 — Check-in diario

**Prioridad:** P0

- Hoy muestra solo compromisos aplicables.
- Completar/deshacer requiere máximo dos interacciones.
- Estados: sincronizando, confirmado, pendiente offline o error.

**Aceptación:**

- El check-in normal ocurre en menos de 60 segundos.
- No se confirma definitivamente antes de persistir o encolar de forma fiable.
- Error reintentable sin pérdida de datos.
- Todas las vistas se actualizan al recuperar foco.

### HEX-P05 — Fecha, consistencia y recuperación

**Prioridad:** P0

- Cada acción pertenece a la fecha civil de la zona configurada.
- La racha considera solo días programados.
- Racha actual, mejor racha, consistencia 7/30 e historial.
- Flujo de reentrada después de un fallo.

**Aceptación:**

- Tests cubren 18:59/19:00 y 23:59/00:00 en Panamá, DST, cambio de zona y concurrencia.
- Un descanso planificado no rompe la continuidad.
- Cambiar zona no reescribe silenciosamente el historial.
- El copy nunca dice “fracasaste” o “perdiste todo”.

### HEX-P06 — Transformación medible

**Prioridad:** P0

- Una métrica opcional, unidad, valor, fecha y nota.
- Tendencia descriptiva, sin interpretación clínica.
- Editar y eliminar registro.

**Aceptación:**

- Rechaza `NaN`, infinito, fuera de rango configurado y notas excesivas.
- No diagnostica ni califica el cuerpo.
- Ningún valor o nota llega a analítica.
- Historial paginado y exportable.

### HEX-P07 — Revisión semanal

**Prioridad:** P0

- Planificado vs. realizado, fechas con evidencia y transformación opcional.
- Reflexión corta.
- Mantener, reducir, aumentar o sustituir.

**Aceptación:**

- Se completa en menos de tres minutos.
- Ajustar conserva historial previo.
- El evento analítico no incluye texto privado.
- Sin datos suficientes, la app lo dice explícitamente.

### HEX-P08 — Recordatorios

**Prioridad:** P0

- Pedir permiso después de que el usuario elige horario.
- Quiet hours, edición y desactivación global/por hábito.
- Máximo predeterminado: dos por día.

**Aceptación:**

- Rechazar permiso no bloquea el producto.
- Pantalla bloqueada no revela datos sensibles ni usa culpa.
- Cambio de zona recalcula de forma explícita.

### HEX-P09 — Privacidad y cuenta

**Prioridad:** P0

- Aviso justo antes de datos sensibles.
- Inventario, finalidad y retención.
- Exportación, eliminación autenticada y logout dentro de la app.
- Privacidad y soporte visibles sin login.

**Aceptación:**

- Usuario A no puede leer o alterar datos de B.
- Eliminar revoca sesión y borra/anonimiza conforme a política aprobada.
- Exportación legible con todos los datos del usuario.
- Ningún control de privacidad se cobra.

### HEX-P10 — Marca y accesibilidad

**Prioridad:** P0

- Dark-first: Obsidiana, Carbón, Oro, Hueso y Esmeralda.
- Inter para UI; Satoshi solo con licencia y asset versionado.
- Copy directo y no celebratorio.
- Contraste, roles, estados, cutouts y escalado.

**Aceptación:**

- Texto normal ≥4.5:1; texto grande y gráficos cumplen el criterio aplicable.
- VoiceOver/TalkBack anuncian nombre, rol, estado y error.
- Flujo funciona con texto 200%, teclado y teléfono pequeño.
- Texto sobre oro usa una tinta con contraste suficiente.

### HEX-P11 — Backend, confiabilidad y release

**Prioridad:** P0

- Build reproducible.
- Esquema, constraints, migraciones y RLS versionados.
- Check-in/racha atómicos.
- CI con pruebas, bundles y validación del backend.
- Observabilidad sin datos sensibles.

**Aceptación:**

- `npm ci`, Expo Doctor y bundle Android/iOS terminan en cero.
- Tests negativos A/B/anónimo pasan.
- Cero imports directos sin declarar.
- CI bloquea errores de test/build/RLS/migración.
- Identificadores, signing, rollback y entornos documentados.

## 10. Requisitos no funcionales

| Área | Requisito inicial |
|---|---|
| Rendimiento | Feedback visual local de check-in <100 ms; el estado “confirmado” solo aparece tras persistencia o encolado verificable |
| Disponibilidad | Degradación explícita sin red; ningún dato silenciosamente perdido |
| Seguridad | RLS deny-by-default, token seguro, secretos solo server-side |
| Privacidad | Minimización, consentimiento contextual, exportación, borrado y retención |
| Accesibilidad | WCAG 2.2 AA aplicable, VoiceOver/TalkBack, 200% text, reduce motion |
| Compatibilidad | iOS/Android soportados por Expo SDK; matriz real definida antes de beta |
| Localización | Copy fuera de lógica; fecha, número y unidad localizados |
| Observabilidad | Crash/performance/error codes sin PII o contenido privado |
| Recuperación | Mutaciones idempotentes; reintento y rollback verificables |

## 11. Monetización

### Decisión para beta

Beta gratuita, sin publicidad y sin SDK de monetización. No cobrar hasta demostrar activación, SEC Rate y seguridad.

### Hipótesis posterior

**Core gratuito**

- Un plan activo.
- Hasta tres hábitos.
- Una métrica.
- Revisión semanal básica.
- Toda función de privacidad/cuenta.

**HEXIS Pro**

- Múltiples ciclos, hábitos y métricas.
- Comparación e historial avanzado.
- Insights descriptivos no clínicos.
- Programas editoriales.
- IA futura bajo suscripción y consentimiento separados.

**Precio a experimentar:** USD 8.99/mes o USD 59.99/año, localizado. No es una decisión final.

Condiciones:

- Sin anuncios ni venta de datos.
- Paywall después de experimentar valor.
- Renovación, cancelación y precio visibles.
- Nunca vender reparación de racha.
- Sin lifetime al lanzamiento.

## 12. Riesgos y experimentos

| Riesgo | Evidencia a producir | Señal para avanzar |
|---|---|---|
| El tono exigente genera culpa | Test de copy tras éxito y fallo | Se percibe respetuoso, no punitivo |
| “Identidad” resulta abstracta | Entrevistas y test de propuesta | Usuario explica el valor sin ayuda |
| Onboarding largo | Prototipo moderado/no moderado | ≥80% termina; mediana ≤4 min |
| Progreso físico no interesa | Métrica opcional en prototipo | Uso voluntario sin caída relevante |
| Racha causa abandono | Reentrada vs. racha rígida | Mayor retorno después del primer fallo |
| Revisión semanal no aporta | Piloto concierge 4 semanas | Se completa y conduce a ajustes |
| Precio premium no se sostiene | Test transparente por mercado | Intención sin quejas de opacidad |
| Datos sensibles erosionan confianza | Test de comprensión | Usuario entiende qué se guarda y cómo borrar |
| IA expone o inventa | Programa de evals separado | No se habilita sin controles y fallback |

### Secuencia de validación

1. 12–15 entrevistas.
2. Prototipo de onboarding/Hoy con 5–8 pruebas.
3. Cierre de gates técnicos y de confianza.
4. Piloto concierge de cuatro semanas dentro de una beta privada de 20–30 personas.
5. Ampliación de beta solo si valor y guardrails pasan.
6. Test de monetización tras retención suficiente.
7. IA y comunidad como programas independientes.

## 13. Gates de producto

| Gate | Condición de salida | Estado inicial |
|---|---|---|
| P0 Estrategia | Segmento, PRD, no-objetivos y ownership | Documentado; aprobación humana pendiente |
| P1 Descubrimiento | Entrevistas, prototipo, copy y alcance congelado | Pendiente |
| T0 Build | Dependencias, bundles y mobile-only reproducible | Cerrado localmente; CI remota verde |
| T1 Confianza | Auth, RLS, fecha civil, almacenamiento seguro y privacidad | Local aprobado; remoto, backup/restore y Auth de producción pendientes |
| Q1 Beta | Tests, accesibilidad, dispositivos, CI y cero alto/crítico | Bloqueado por revisión semanal parcial, builds y QA nativo |
| V1 Valor | Activación, SEC y retorno después de fallo | Pendiente |
| M1 Monetización | Retención, pricing, compras y políticas | No autorizado |
| R1 Público | Signing, assets, rollback y auditoría final | Bloqueado |

## 14. Definición de éxito del MVP

El MVP no termina cuando “tiene todas las pantallas”. Termina cuando:

- el usuario completa el ciclo identidad → plan → evidencia → revisión;
- la información puede reconstruirse y exportarse;
- fallar una acción conduce a recuperación, no pérdida artificial;
- los datos están aislados y las mutaciones son confiables;
- los flujos críticos pasan accesibilidad y dispositivo real;
- SEC Rate, activación y retención pueden medirse sin recolectar contenido privado.
