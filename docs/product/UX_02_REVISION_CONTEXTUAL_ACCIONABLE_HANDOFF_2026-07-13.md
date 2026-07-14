# UX-02 — Handoff de Revisión contextual y accionable

- **Clasificación:** interno y propietario
- **Versión del handoff:** 0.2
- **Identificador del prototipo:** `UX02-PROT-v0.2`
- **Fecha:** 2026-07-13
- **Plataforma objetivo:** React Native, teléfonos iOS y Android
- **Roles responsables:** App Product Designer + App Interaction Designer + React Native Developer
- **Estado del entregable:** prototipo navegable interno implementado y gates de ingeniería locales verdes; no aprobado para piloto contabilizable ni integración productiva
- **Evidencia con usuarios:** ninguna; 0 entrevistas y 0 pruebas de usabilidad realizadas

## 1. Decisión de este corte

Este documento define el contrato de baja fidelidad y su implementación navegable verificable para UX-02. El harness aislado está en `prototypes/ux02` y permite preparar la Tarea T4 del protocolo U0 sin alterar la aplicación productiva ni su modelo de datos.

No autoriza:

- implementar el flujo en producción;
- cambiar RPC, esquema, analítica o cola offline;
- interpretar una métrica como causa, diagnóstico o recomendación;
- reclutar participantes antes de aprobar el preflight U0;
- declarar que la Revisión mejora retención, conducta o resultados personales.

La decisión de diseño para el prototipo es un flujo progresivo de tres pasos:

1. comprender contexto y evidencia;
2. elegir un compromiso y una decisión;
3. previsualizar y confirmar su efecto D+1.

`Mantener` registra una decisión sin crear una versión redundante del compromiso. `Reducir`, `Aumentar` y `Sustituir` preparan un borrador D+1 explícito. Esta distinción es parte del prototipo y debe validarse; todavía no es una decisión productiva congelada.

“Listo para revisión” significa que existe material suficiente para una revisión de Product, UX y Privacy y para construir un artefacto interno totalmente sintético. No equivale a aprobación de esos roles, cierre del preflight, autorización de reclutamiento ni evidencia favorable.

## 2. Trazabilidad

Fuentes de control: [PRD](PRODUCT_STRATEGY_AND_PRD.md), [protocolo U0](../research/PROTOCOLO_RESEARCH_U0_2026-07-13.md) y [plan maestro](../roadmap/ANALISIS_DE_BRECHAS_Y_PLAN_MAESTRO_2026-07-12.md).

| Fuente | Requisito o pregunta | Respuesta del handoff |
|---|---|---|
| PRD `HEX-P02` | Identidad/meta reaparecen en Revisión | Bloque de contexto al inicio del paso 1 |
| PRD `HEX-P06` | Métrica opcional y descriptiva | Estado sin métrica, un registro, dos o más registros y error aislado |
| PRD `HEX-P07` | Planificado vs. realizado, reflexión y decisión | Resumen verificable, reflexión breve y cuatro decisiones |
| PRD `HEX-P07` | Revisión en menos de tres minutos | Tres pasos, una decisión y un compromiso por revisión |
| PRD `HEX-P07` | Ajustar conserva historia | El prototipo representa fecha exacta e historia preservada en preview/recibo; la persistencia técnica sigue sin verificar y queda bloqueada para U1 |
| PRD `HEX-P07` | Ausencia de datos explícita | Estados de evidencia y métrica insuficientes, sin inferencias |
| Roadmap `UX-02` | Identidad/meta; compromiso y ajuste generan borrador D+1 | Modelo `review_action_draft.v1` y wireframes 1–3 |
| U0 `U0-Q05` | Evidencia necesaria para ajustar | Identidad/meta, planificado/realizado y desglose por compromiso |
| U0 `U0-Q06` | La métrica ayuda o distrae | Bloque opcional sin jerarquía causal ni semáforo |
| U0 T4 | Decisión concreta, compromiso y efecto D+1 | Tarea y criterios de observación en la sección 15 |

## 3. Hechos disponibles y límites de evidencia

### Hechos verificables en el repositorio

- La aplicación ya calcula la última semana ISO cerrada en la zona del plan.
- Una semana fuera de la vigencia no consulta ni guarda una Revisión.
- La pantalla actual muestra planificado/realizado, consistencia, fechas de evidencia, trayectoria y desglose por compromiso.
- La pantalla actual recoge una reflexión y una decisión `keep | reduce | increase | replace`.
- La pantalla actual inicia y restablece la decisión en `keep`; no existe el estado “sin decisión”.
- La pantalla actual exige una reflexión de 3–500 caracteres; no permite omitirla al guardar.
- El contrato actual guarda la Revisión y luego navega a Disciplina; no identifica un compromiso objetivo ni prepara el cambio.
- La métrica opcional no participa en la Revisión actual.
- La evidencia local pendiente bloquea el cierre de la semana.
- La pantalla actual consulta repositorios reales, llama la mutación de Revisión y ejecuta el intento de evento `weekly_review_completed`; aunque el runtime actual no tiene un destino analítico conectado, ese código no se reutilizará sin aislamiento en U0.

### Delta obligatorio entre la pantalla actual y el prototipo

Esta matriz es un contrato de construcción. Un cambio deliberado no debe quedar oculto como simple ajuste visual.

| Área | `WeeklyReviewScreen` actual | `UX02-PROT-v0.2` |
|---|---|---|
| Fuente de datos | Repositorios, sesión y mutación reales | Fixtures locales, inmutables y sintéticos; sin repositorios, RPC ni sesión real |
| Decisión inicial | `keep` preseleccionado | `null`; ninguna opción seleccionada |
| Reflexión | Obligatoria, 3–500 caracteres | Opcional, 0–500 caracteres |
| Identidad/meta | No aparecen | Contexto de solo lectura |
| Métrica | No aparece | Cinco estados sintéticos y aislados del resto de la pantalla |
| Compromiso objetivo | No se selecciona | Selección explícita, incluso cuando solo hay uno |
| Efecto de guardar | Persiste Revisión y luego navega a Disciplina | Simula preview/recibo; no persiste ni cambia configuración |
| Analítica | Invoca el evento permitido, con sink nulo por defecto | No invoca eventos; sink nulo y ausencia de llamadas comprobados antes del piloto |
| `Aumentar` | Copy actual: “subir el estándar” | Semántica provisional y más estrecha: añadir días programados; no cambia la acción mínima |

### Perfil obligatorio del harness U0

- entrada dedicada al prototipo, fuera de la navegación normal y marcada para el equipo como “U0 · DATOS SINTÉTICOS”;
- adaptador de fixtures local e inmutable; el bundle del harness no importa repositorios, autenticación, almacenamiento productivo ni clientes remotos;
- red denegada durante la prueba; cualquier solicitud saliente hace fallar el preflight técnico;
- sin claves, tokens, correos, cuentas o identificadores de producción;
- analítica, crash reporting y telemetría deshabilitados, con comprobación reproducible de sink nulo y cero llamadas;
- reset determinista entre sesiones, sin conservar input o asignación de otra persona;
- versión, escenario y variante visibles para el equipo, pero no presentados como recomendación al participante.

### Lo que no sabemos todavía

- Si “identidad”, “meta”, “compromiso” y “D+1” se entienden sin ayuda.
- Si la métrica opcional mejora la decisión o añade carga.
- Si el orden “compromiso antes de decisión” coincide con el modelo mental del segmento.
- Si las cuatro decisiones son distinguibles y no inducen presión.
- Si una reflexión opcional es suficiente.
- Si el flujo completo puede terminarse en menos de tres minutos.
- Si el copy se percibe sereno y no punitivo después de una semana con ausencia.

Toda afirmación de utilidad en este documento es una hipótesis de diseño, no evidencia de usuario.

## 4. Resultado de usuario

Al terminar la Revisión, una persona debe poder explicar con sus propias palabras:

1. qué intentaba sostener y para qué;
2. qué estaba programado y qué evidencia existe;
3. si una métrica está ausente, es insuficiente o solo describe un cambio;
4. sobre qué compromiso decidió;
5. si mantendrá, reducirá, aumentará o sustituirá;
6. qué cambia exactamente y en qué fecha civil;
7. que lo registrado antes de esa fecha permanece intacto.

El producto no elige por la persona, no puntúa su identidad y no atribuye una variación de métrica a un compromiso.

## 5. Alcance del prototipo

### Incluido

- una semana ya cerrada y elegible;
- identidad y meta como contexto de solo lectura;
- resumen planificado vs. evidencia, sin juicio moral;
- desglose por compromiso;
- métrica opcional con cinco condiciones: no configurada, sin registros, un registro, dos o más y error aislado;
- reflexión breve opcional para minimizar datos;
- selección explícita de un compromiso;
- selección sin valor predeterminado entre cuatro decisiones;
- editor mínimo según la decisión;
- preview con fecha civil D+1 y zona del plan;
- confirmación, recibo, error, conflicto y offline;
- comportamiento esperado con lector de pantalla y texto al 200%.

### Fuera del prototipo

- recomendaciones automáticas o IA;
- causalidad, predicción o interpretación clínica;
- comparar a la persona con terceros;
- cambiar varios compromisos en una sola Revisión;
- editar evidencia histórica desde Revisión;
- libro/calendario de evidencia;
- varias métricas simultáneas;
- monetización, coaching o contenido editorial;
- persistencia real, migraciones, RPC o instrumentación nueva.

## 6. Hipótesis a contrastar

| ID | Hipótesis | Señal observable en U0 | Estado |
|---|---|---|---|
| UX02-H01 | Identidad y meta ayudan a interpretar la semana sin sentirse como evaluación personal | La persona las usa espontáneamente para explicar su decisión | Sin evidencia |
| UX02-H02 | Planificado vs. evidencia y desglose por compromiso bastan para una decisión inicial | Decide sin pedir un score adicional | Sin evidencia |
| UX02-H03 | Una métrica opcional puede leerse como contexto, no como causa ni obligación | Explica que puede omitirla y no atribuye causalidad | Sin evidencia |
| UX02-H04 | Elegir el compromiso antes de la acción reduce ambigüedad | Selecciona el objeto correcto sin asistencia | Sin evidencia |
| UX02-H05 | Mantener, Reducir, Aumentar y Sustituir son opciones mutuamente comprensibles | Parafrasea el efecto de cada opción relevante | Sin evidencia |
| UX02-H06 | Una fecha exacta comunica D+1 mejor que la etiqueta sola | Explica correctamente cuándo cambia y qué historia permanece | Sin evidencia |
| UX02-H07 | No preseleccionar una decisión evita aceptación accidental | Elige deliberadamente y reconoce que no había recomendación | Sin evidencia |
| UX02-H08 | La reflexión opcional puede omitirse sin bloquear la comprensión del resultado | Completa el flujo y hace teach-back correcto con el campo vacío | Sin evidencia |
| UX02-H09 | El límite de un cambio se comprende y no oculta la intención inmediata | Después de la tarea explica el límite; cualquier intento de cambiar otro compromiso o necesidad no cubierta se registra | Sin evidencia |
| UX02-H10 | Tres pasos caben en una mediana de tres minutos | Mediana T4 ≤3 minutos | Sin evidencia |

No se debe convertir ninguna de estas hipótesis en requisito productivo antes del veredicto U0.

H08 y H09 son señales cualitativas/exploratorias. Con 5–8 participantes y una interfaz que fuerza un solo cambio no se puede demostrar una mejora comparativa de “calidad”, claridad o tiempo; solo detectar bloqueo, incomprensión o necesidad no cubierta.

## 7. Datasets sintéticos U0

El prototipo no usará cuentas, métricas ni textos reales.

### Escenario A — aprendizaje, comprensión transversal

| Campo | Valor ficticio |
|---|---|
| `scenario_id` | `UX02-SC-A-APRENDER-v1` |
| Fecha civil de Revisión | lunes 13 de julio de 2026 |
| Zona del plan | `America/Panama` |
| Semana cerrada | lunes 6 a domingo 12 de julio de 2026 |
| Identidad elegida | “Soy una persona que protege tiempo para aprender” |
| Meta | “Terminar un curso introductorio durante ocho semanas” |
| Compromiso | “Estudiar” |
| Acción mínima | “Abrir la lección y leer un apartado” |
| Programación | lunes, miércoles y viernes |
| Evidencia | lunes completa; miércoles mínima; viernes sin evidencia |
| Métrica opcional | “Lecciones terminadas”, unidad `lecciones` |
| Registros de métrica | lunes: 4; domingo: 5 |
| Rama de referencia para los wireframes | reducir programación a lunes y viernes |
| Fecha efectiva esperada | martes 14 de julio de 2026 |

Este escenario corresponde a un uso posterior contemplado por el PRD. Puede revelar problemas de comprensión transversal, pero por sí solo no valida el beachhead de disciplina física ni autoriza una decisión de mercado.

### Escenario B — disciplina física no clínica

| Campo | Valor ficticio |
|---|---|
| `scenario_id` | `UX02-SC-B-FUERZA-v1` |
| Fecha civil de Revisión | lunes 13 de julio de 2026 |
| Zona del plan | `America/Panama` |
| Semana cerrada | lunes 6 a domingo 12 de julio de 2026 |
| Identidad elegida | “Soy una persona que entrena con constancia” |
| Meta | “Completar un ciclo básico de fuerza durante ocho semanas” |
| Compromiso | “Entrenamiento de fuerza” |
| Acción mínima | “Hacer el calentamiento y una serie técnica” |
| Programación | martes, jueves y sábado |
| Evidencia | martes completa; jueves mínima; sábado sin evidencia |
| Métrica opcional | “Minutos de entrenamiento”, unidad `minutos` |
| Registros de métrica | martes: 20; domingo: 25 |
| Rama de referencia | reducir programación a martes y sábado |
| Fecha efectiva esperada | martes 14 de julio de 2026 |

El escenario B representa el beachhead del PRD sin usar peso, perímetros, diagnóstico, tratamiento ni datos corporales. Tampoco demuestra eficacia física: solo permite observar comprensión e interacción en un contexto más cercano al segmento inicial.

Antes de iniciar sesiones válidas, Research congela una matriz balanceada de asignación A/B. Cada participante recibe un solo escenario, consistente de T1 a T4; no ve ambos en la medición principal. Se registra `scenario_assignment_id`, se informa `n/N` por escenario y no se infieren diferencias de segmento con una muestra de 5–8.

Los wireframes siguientes usan el escenario A. El escenario B sustituye únicamente el contenido definido en su tabla; jerarquía, controles, estados y criterios no cambian. Las variantes de estado cambian solo el mínimo necesario: sin métrica, un único registro, error de métrica, evidencia pendiente, offline, conflicto y rollover de fecha.

## 8. Arquitectura de información y flujo

```text
Entrada a Revisión
  ├─ semana no elegible → estado informativo existente
  ├─ carga/error → recuperar sin perder contexto
  └─ semana elegible
       ↓
Paso 1 · Comprender
  identidad + meta
  evidencia agregada + desglose
  métrica opcional descriptiva
  reflexión opcional
       ↓
Paso 2 · Decidir
  elegir un compromiso
  elegir mantener/reducir/aumentar/sustituir
       ↓
Paso 3 · Preparar
  editar solo los campos necesarios
  preview antes/después
  fecha civil D+1 + historia preservada
       ↓
Confirmación explícita
  ├─ confirmado → recibo verificable
  ├─ conflicto/rollover → volver a preview
  └─ offline/error → conservar input visible y reintentar
```

Reglas:

- no existe una opción preseleccionada;
- ningún copy, badge o estado presenta una opción como recomendada; el orden puede producir saliencia y se controla como variable del instrumento;
- una Revisión produce como máximo una decisión sobre un compromiso;
- `Mantener` no crea configuración duplicada;
- un cambio nunca se describe como preparado hasta tener confirmación durable;
- la fecha efectiva se calcula en la zona del plan al confirmar, no en la zona del dispositivo;
- si cambia la fecha civil, el preview anterior queda inválido y debe aceptarse de nuevo.

## 9. Wireframes textuales

### 9.1 Paso 1 — Comprender la semana

```text
┌──────────────────────────────────────┐
│ ‹ Atrás              Paso 1 de 3     │
│ REVISIÓN SEMANAL                     │
│ Decide con evidencia                 │
│ 6–12 de julio · America/Panama       │
│ [Semana cerrada · Lista para revisar]│
├──────────────────────────────────────┤
│ IDENTIDAD ELEGIDA                    │
│ Soy una persona que protege tiempo   │
│ para aprender                        │
│                                      │
│ META                                 │
│ Terminar un curso introductorio      │
│ durante ocho semanas                 │
├──────────────────────────────────────┤
│ EVIDENCIA DE LA SEMANA               │
│ 2 de 3 días programados con evidencia│
│ 1 completa · 1 mínima · 1 sin registro│
│                                      │
│ Estudiar                             │
│ 2 de 3 · reentrada pendiente         │
├──────────────────────────────────────┤
│ MÉTRICA OPCIONAL                     │
│ Lecciones terminadas                 │
│ 4 → 5 lecciones · cambio: +1         │
│ Dato descriptivo. No explica por qué │
│ cambió.                              │
├──────────────────────────────────────┤
│ REFLEXIÓN BREVE · OPCIONAL           │
│ [¿Qué facilitó o interrumpió...]     │
│ 0/500                                │
│                                      │
│ [ Elegir siguiente paso ]            │
└──────────────────────────────────────┘
```

Notas:

- “2 de 3” precede al porcentaje para reducir abstracción.
- “Sin registro” describe ausencia de evidencia, no incumplimiento moral.
- La métrica usa texto y valores; no flecha verde/roja ni “mejor/peor”.
- La reflexión es opcional en el prototipo por minimización. U0 decidirá si debe seguir así.
- El botón permanece disponible aunque no exista métrica o reflexión.

### 9.2 Paso 2 — Elegir el objeto y la decisión

```text
┌──────────────────────────────────────┐
│ ‹ Semana             Paso 2 de 3     │
│ Elige un siguiente paso              │
├──────────────────────────────────────┤
│ ¿SOBRE QUÉ COMPROMISO DECIDIRÁS?     │
│ ( ) Estudiar                         │
│     2 de 3 días con evidencia        │
│     Mínima: Abrir la lección...      │
├──────────────────────────────────────┤
│ ¿QUÉ HARÁS CON ESTE COMPROMISO?      │
│ ( ) Mantener                         │
│     Continuará con la misma config.  │
│ ( ) Reducir                          │
│     Menos días o una acción mínima   │
│     más pequeña.                     │
│ ( ) Aumentar                         │
│     Más días programados.            │
│ ( ) Sustituir                        │
│     Otra acción ocupará su lugar.    │
│                                      │
│ [ Continuar ]  (deshabilitado)       │
└──────────────────────────────────────┘
```

Notas:

- Incluso con un solo compromiso, la selección es explícita para comprobar comprensión.
- Ninguna decisión aparece seleccionada por defecto.
- El CTA se habilita al seleccionar compromiso y decisión.
- El orden queda fijo dentro de cada versión del instrumento. Si Research decide contrabalancearlo, debe crear variantes versionadas, asignarlas antes de cada sesión mediante una matriz congelada y reportarlas por separado; no se asumirá que el orden es neutral.

### 9.3 Paso 3A — Preparar `Reducir`

```text
┌──────────────────────────────────────┐
│ ‹ Decisión           Paso 3 de 3     │
│ Prepara el cambio                    │
│ Estudiar · Reducir                   │
├──────────────────────────────────────┤
│ ¿QUÉ REDUCIRÁS?                      │
│ (•) Días programados                 │
│ ( ) Acción mínima                    │
│                                      │
│ Días actuales                        │
│ [Lun ✓] [Mié ✓] [Vie ✓]             │
│ Días desde el 14 de julio            │
│ [Lun ✓] [Mié  ] [Vie ✓]             │
├──────────────────────────────────────┤
│ PREVIEW D+1                          │
│ Hasta el 13 de julio                 │
│ Lun · Mié · Vie                      │
│                                      │
│ Desde el martes 14 de julio          │
│ Lun · Vie                            │
│                                      │
│ Tu evidencia anterior permanece.     │
│ Zona del plan: America/Panama        │
├──────────────────────────────────────┤
│ [ Revisar y confirmar ]              │
└──────────────────────────────────────┘
```

Validación del editor:

- debe existir al menos una diferencia entre antes y después;
- no permite cero días si la intención es `Reducir`; pausar/archivar queda fuera de UX-02;
- la acción mínima nueva no puede quedar vacía ni superar los límites aprobados;
- cambiar días y acción mínima a la vez requiere una decisión explícita “Ambos”; no ocurre por accidente;
- los controles muestran nombres completos, no solo iniciales, con texto al 200%.

En el artefacto navegable U0, las posibles reflexiones, acciones mínimas reducidas y sustituciones se materializan como opciones sintéticas congeladas, no como texto libre. Esta adaptación de aislamiento conserva la posibilidad de omitir la reflexión y de comparar las ramas, pero no pretende validar redacción autónoma; cualquier futura entrada libre exige un protocolo y tratamiento de datos distinto.

### 9.4 Variantes del paso 3

#### Mantener

- No muestra editor.
- Preview: “Desde el martes 14 de julio, Estudiar continúa con la misma acción mínima y los mismos días.”
- Confirmar registra la Revisión; `adjustment` queda en `null` y no crea una versión idéntica.

#### Aumentar

- Permite añadir días programados; nunca los añade automáticamente.
- Copy: “Elige los días adicionales. HEXIS no interpreta la métrica como una recomendación.”
- Requiere al menos un día nuevo y respeta límites de agenda/slots definidos por dominio.
- Si el compromiso ya está programado los siete días, `Aumentar` queda deshabilitado con “No hay más días disponibles en esta versión”; no se inventa otra dimensión de aumento.
- Cambiar el estándar completo no entra en este prototipo porque el modelo actual no define una cantidad objetivo completa.

Esta es una reducción semántica deliberada respecto al copy actual “subir el estándar”: en `UX02-PROT-v0.2`, `Aumentar` significa únicamente añadir días. No permite aumentar la acción mínima ni demuestra que ese sea el significado productivo correcto. U0 debe registrar si la etiqueta y su alcance se comprenden; Product deberá congelar o cambiar la semántica antes de U1.

#### Sustituir

- Campos: nombre del nuevo compromiso, acción mínima y días.
- Preview separa “Estudiar hasta el 13 de julio” de “Practicar ejercicios desde el 14 de julio”.
- Copy: “La evidencia de Estudiar permanece en tu historial.”
- La semántica de `lineage_id` para sustitución debe decidirla Product + Data antes de implementar.

### 9.5 Confirmación

```text
┌──────────────────────────────────────┐
│ CONFIRMA TU DECISIÓN                 │
│ Semana revisada: 6–12 de julio       │
│ Compromiso: Estudiar                 │
│ Decisión: Reducir                    │
│ Cambio: Lun/Mié/Vie → Lun/Vie        │
│ Entra en vigor: martes 14 de julio   │
│ Historia anterior: se conserva       │
│                                      │
│ [ Volver a editar ]                  │
│ [ Guardar revisión y preparar cambio]│
└──────────────────────────────────────┘
```

El botón final incluye ambas consecuencias. No se usa “Listo”, “Mejoraste” ni “Plan optimizado”.

### 9.6 Recibo confirmado

Para cambio:

> Revisión guardada. El cambio de Estudiar entra en vigor el martes 14 de julio. Tu evidencia anterior permanece.

Para mantener:

> Revisión guardada. Estudiar continúa sin cambios.

Acciones secundarias:

- `Ver configuración desde el 14 de julio` para cambios;
- `Volver a Hoy` para todas las decisiones.

El foco accesible se mueve al título del recibo. El estado confirmado solo aparece tras una respuesta durable e idempotente.

## 10. Modelo conceptual del borrador D+1

El siguiente modelo es un contrato de diseño, no un esquema aprobado:

```text
review_action_draft.v1
  scope
    account_scope        // aislado; nunca se envía a analítica
    plan_id
    review_week_start
    review_civil_date
    plan_timezone
  target
    commitment_id
    lineage_id
    source_version
  decision               // keep | reduce | increase | replace
  before
    name
    minimum_action
    scheduled_weekdays
  adjustment             // null para keep
    kind                  // schedule | minimum_action | both | replace
    after
      name?
      minimum_action?
      scheduled_weekdays?
  effective_on           // review_civil_date + 1 en plan_timezone
  preserves_history      // siempre true
  reflection             // opcional; privada; pertenece a la Revisión
  confirmation_expectation
    expected_review_civil_date
    expected_effective_on
    expected_source_version
  status                 // editing | ready | submitting | confirmed | conflict
  operation_scope        // idempotencia; no visible ni analítica
```

### Invariantes

1. El borrador se invalida al cambiar cuenta, plan, semana o compromiso objetivo.
2. El cliente deriva `effective_on` para el preview, pero su reloj nunca es la autoridad productiva.
3. Inmediatamente antes de enviar, el cliente actualiza `expected_review_civil_date`, `expected_effective_on` y `expected_source_version` y muestra cualquier cambio para nueva confirmación.
4. En U1, la transacción/RPC deriva la fecha civil con tiempo autoritativo y la zona almacenada del plan; compara los tres valores esperados dentro de la misma transacción.
5. Si fecha, zona o versión no coinciden, no guarda Revisión ni ajuste, devuelve `conflict` y obliga a mostrar un preview nuevo antes de otro intento.
6. `keep` requiere target y decisión, pero `adjustment = null`.
7. Las otras decisiones requieren una diferencia material y válida.
8. La versión objetivo debe seguir siendo la vigente; cualquier cambio concurrente produce `conflict`.
9. Una edición futura incompatible ya existente bloquea otro borrador hasta resolverla.
10. Identidad, meta y valores de métrica son contexto derivado; no se duplican dentro del borrador.
11. La reflexión y los nombres/acciones nunca van a logs, crash reports ni analítica.
12. No se muestra éxito de cambio si solo quedó guardada la Revisión.

### Persistencia futura

Para producción, Backend + Data deben escoger y probar una de estas estrategias:

- una transacción idempotente que cierre Revisión y programe el cambio como unidad; o
- una Revisión durable con estado explícito `adjustment_pending`, reanudable y sin falso éxito.

La primera es la recomendación de producto por claridad, pero requiere validación de arquitectura, RLS, exportación, borrado e idempotencia. En cualquier estrategia, la comparación autoritativa de fecha civil/zona/versión y la escritura deben compartir una frontera transaccional; una validación solo en el dispositivo no cumple el contrato. El prototipo U0 simula el conflicto, mantiene el borrador solo en memoria y usa datos sintéticos. No se debe reutilizar la cola de check-in sin revisión específica de Privacy, Offline y AppSec.

## 11. Estados, errores y recuperación

| Estado | Comportamiento y copy | Acción permitida | ¿Bloquea confirmación? |
|---|---|---|---:|
| Cargando | “Cargando la semana cerrada…” con estado busy | Esperar | Sí |
| Semana no elegible | Mantener el estado UX-01 y la primera fecha disponible | Volver a Hoy | Sí |
| Evidencia sincronizando | “Hay evidencia pendiente. La Revisión espera para no resumir una semana incompleta.” | Reintentar sincronización | Sí |
| Sin acciones programadas | “No hubo acciones programadas esta semana.” | Reflexionar y decidir si mantener/cambiar | No, sujeto a U0 |
| Cero evidencia | “No hay evidencia registrada. No inferiremos qué ocurrió.” | Continuar | No |
| Sin métrica configurada | “Este plan no usa una métrica opcional.” | Continuar | No |
| Métrica con 0 registros | “No registraste una métrica esta semana. No es necesaria para decidir.” | Continuar | No |
| Métrica con 1 registro | “Hay 1 registro. No hay base para mostrar un cambio semanal.” | Continuar | No |
| Métrica no disponible | “La métrica no está disponible. Tu evidencia diaria sigue visible.” | Reintentar métrica o continuar | No |
| Offline con cache conciliada | Mostrar “Sin conexión · datos confirmados por última vez [fecha/hora]” | Leer y editar borrador de sesión | Sí, hasta contrato durable |
| Conexión perdida al confirmar | “No pudimos confirmar. Tu selección sigue aquí.” | Reintentar | Sí |
| Cambio de fecha civil | “La fecha cambió. Actualizamos el inicio del ajuste a [fecha]. Revísalo antes de confirmar.” | Volver al preview | Sí |
| Configuración cambió en otro lugar | “Estudiar cambió desde que abriste la Revisión.” | Recargar y reconstruir borrador | Sí |
| Ajuste futuro incompatible | “Ya existe un cambio pendiente desde [fecha]. Revísalo antes de preparar otro.” | Ver cambio pendiente | Sí |
| Revisión ya confirmada | Mostrar recibo de solo lectura; no reconstruir otro borrador | Ver configuración | Sí |
| Plan finaliza antes de D+1 | “Este plan termina antes de que el cambio pueda entrar en vigor.” | Mantener cierre o iniciar flujo de ciclo futuro | Sí para cambio |
| Sesión vencida | “Tu sesión terminó. Inicia sesión para confirmar; tu borrador no se envió.” | Iniciar sesión | Sí |
| Revisión guardada, cambio pendiente | “La Revisión está guardada, pero el cambio aún no está preparado.” | Reanudar cambio | Sí para recibo completo |
| Error desconocido | “No pudimos confirmar la Revisión. Nada cambió.” más código seguro | Reintentar o soporte | Sí |

No se promete conservar el borrador tras cerrar la app hasta que exista persistencia aprobada y probada. En el prototipo moderado, el facilitador usa recuperación sintética y marca `NA` si un defecto impide medir.

## 12. Sistema de copy

### Copy propuesto para revisión del prototipo

| Intención | Copy |
|---|---|
| Título | “Decide con evidencia” |
| Ausencia | “Sin registro” / “No hay evidencia registrada” |
| Métrica | “Dato descriptivo. No explica por qué cambió.” |
| Selección | “¿Sobre qué compromiso decidirás?” |
| D+1 | “Desde el martes 14 de julio” |
| Historia | “Tu evidencia anterior permanece.” |
| Offline | “No pudimos confirmar. Tu selección sigue aquí.” |
| Conflicto | “Cambió desde que abriste la Revisión.” |
| Mantener | “Continuará con la misma configuración.” |

### Copy prohibido

- “Fallaste”, “perdiste la semana”, “rompiste tu racha”.
- “Buen trabajo”, “estamos orgullosos”, “eres imparable”.
- “La métrica demuestra que funciona”.
- “Debes aumentar”, “recomendado para ti” o cualquier prescripción automática.
- “Tu identidad mejoró/empeoró”.
- “Cambio guardado” antes de confirmación durable.
- “Mañana” sin fecha exacta en el preview final.
- “Progreso” como sinónimo automático de que un valor subió o bajó.

## 13. Accesibilidad y adaptación

### Estructura y navegación

- Un `header` principal por paso y encabezados de sección en orden lógico.
- Indicador “Paso X de 3” con valor accesible, nunca solo puntos visuales.
- Orden de foco: encabezado, contexto, evidencia, métrica, reflexión, CTA.
- Atrás conserva el borrador de sesión y no cambia la fecha efectiva silenciosamente.
- Todos los flujos se operan por toque, teclado y lector de pantalla; no dependen de swipe.

### Controles

- Compromisos y decisiones usan radio real con `checked`, `disabled` y nombre descriptivo.
- Etiqueta sugerida: “Estudiar, compromiso, 2 de 3 días con evidencia”.
- Etiqueta sugerida: “Reducir, menos días o acción mínima más pequeña”.
- El rol y los estados seleccionado/deshabilitado se exponen mediante `accessibilityRole` y `accessibilityState`; no se duplican dentro de `accessibilityLabel`.
- Los días usan nombre completo accesible: “lunes, seleccionado”; no solo “L”.
- Objetivos táctiles de al menos 48 dp en Android y tamaño equivalente accesible en iOS.
- El CTA deshabilitado expone `disabled`; un texto cercano explica qué falta.

### Estados y anuncios

- Loading usa estado busy y texto visible.
- Error y conflicto usan alert/live region; el foco va al resumen del error después de enviar.
- La selección actualizada y el nuevo preview se anuncian sin mover foco en cada toque.
- Al confirmar, el foco va a “Revisión guardada”.
- El contador de reflexión no se anuncia en cada carácter; anuncia aviso al acercarse al límite y error al superarlo.

### Texto, contraste y movimiento

- Con texto al 200%, tarjetas y columnas se apilan; no hay truncado ni scroll horizontal.
- Los valores “antes/después” siempre tienen etiquetas textuales, no dependen de color o flecha.
- El estado mínimo/completo/sin registro no depende únicamente de icono.
- Contraste mínimo conforme al requisito AA del PRD.
- No se necesita animación para comprender el cambio; cualquier transición respeta reduce motion.

### Métrica

- El lector anuncia: “Lecciones terminadas. Dos registros: 4 el lunes y 5 el domingo. Cambio descriptivo: más 1 lección.”
- No anuncia “mejora” o “deterioro”.
- Si hay gráfico en alta fidelidad, incluye resumen textual equivalente y orden cronológico.

## 14. Privacidad y analítica

### Prototipo U0

- Analítica, crash reporting y telemetría deshabilitados.
- Dataset y cuenta exclusivamente sintéticos.
- No se registra texto de identidad, meta, reflexión, compromiso, acción mínima o métrica.
- Grabación solo bajo el consentimiento separado del protocolo U0.
- El preflight técnico verifica el perfil de harness de la sección 3: bundle sin repositorios/clientes remotos, red denegada, cero credenciales y reset entre sesiones.

### Integración futura

Solo después de U0 y aprobación de Product Data:

- `weekly_review_completed` puede conservar únicamente `decision` y `consistency_band` conforme a la taxonomía v1.
- `plan_adjusted` puede emitirse solo después de persistir el cambio y con propiedades allowlist ya aprobadas.
- Nunca incluir IDs, fechas civiles individuales, texto, valores/unidades de métrica ni configuración del compromiso.
- No emitir `plan_adjusted` para `Mantener` si no existe mutación real.
- Cualquier nueva medición del funnel de Revisión requiere versión de taxonomía, finalidad y revisión Privacy; este handoff no la autoriza.

## 15. Paquete de prueba U0 para T4

### Estado inicial

- `UX02-PROT-v0.2`, `scenario_assignment_id` y variante visibles para el equipo, no para influir al participante;
- semana elegible 6–12 de julio;
- uno de los dos escenarios congelados de la sección 7, consistente de T1 a T4;
- estado de conexión simulado estable en el camino principal, sin red real;
- ninguna decisión preseleccionada;
- analítica deshabilitada.

### Enunciado, sin explicación adicional

> Terminó la semana. Revisa qué ocurrió y decide qué harías la próxima semana sin perder el historial anterior.

### Objetivo observable

La persona:

1. localiza identidad y meta;
2. interpreta 2 de 3 oportunidades con evidencia;
3. explica la métrica como opcional/descriptiva;
4. selecciona el compromiso del escenario asignado;
5. elige una de las cuatro decisiones sin que el moderador indique cuál;
6. si elige un cambio, configura una variante válida; si elige `Mantener`, comprende que no habrá mutación;
7. confirma la fecha efectiva del martes 14 de julio cuando hay cambio;
8. explica que la historia anterior permanece en cualquier rama.

No existe una “decisión correcta” predeterminada. La rama `Reducir` de los wireframes sirve para verificar el editor y el preview. Research evalúa si la persona puede elegir cualquier opción, producir el efecto descrito por esa opción y explicarlo; la dirección elegida o su justificación personal no se califican como correctas o incorrectas.

### Éxito sin asistencia crítica

- completa el camino y llega al recibo correcto;
- no necesita que se le indique dónde seleccionar el compromiso o la decisión;
- no necesita explicación de D+1, historial o métrica opcional;
- cualquier decisión es válida si `Mantener` no produce mutación o, para las otras tres, configura un preview válido conforme a la definición visible;
- no interpreta la ausencia como castigo ni la métrica como recomendación;
- teach-back de fecha efectiva e historia obtiene puntuación 2.

Rúbrica específica T4:

| Resultado | Regla objetiva |
|---|---|
| `2` | Elige cualquier decisión sin asistencia crítica, completa correctamente su rama y explica fecha efectiva, ausencia/presencia de cambio e historia preservada |
| `1` | Completa solo después de que el moderador revela control, significado, fecha o consecuencia |
| `0` | No completa, configura un efecto distinto al mostrado, atribuye causalidad/recomendación o explica incorrectamente fecha/historia |
| `NA` | Un defecto del prototipo impide medir; la dirección elegida nunca convierte por sí sola un resultado en `NA`, `0` o `1` |

### Instrumentación de investigación

Registrar conforme al protocolo U0:

- resultado `2 | 1 | 0 | NA`;
- tiempo válido de T4;
- primer bloque consultado antes de decidir;
- si usa identidad, meta, evidencia o métrica para justificar;
- asistencia y error por paso;
- decisión/compromiso elegidos;
- teach-back de D+1 e historia;
- confianza 1–5;
- palabras percibidas como punitivas, clínicas o ambiguas;
- escenario, asignación, variante y versión exacta del prototipo;
- intento de cambiar otro compromiso o necesidad no cubierta por el límite de uno.

Durante T4 no se agregan preguntas sobre salud, peso, diagnóstico ni se vincula el escenario con la práctica real del participante. Las entrevistas de descubrimiento sobre episodios reales no clínicos son una fase separada del protocolo.

### Umbral de U0 aplicable

- mediana T4 ≤3 minutos;
- al menos `ceil(0.80 × N)` completa sin asistencia crítica;
- al menos 80% explica D+1 e historia con puntuación 2;
- cero interpretación clínica o de resultado garantizado;
- cero P0 abierto;
- todo P1 tiene decisión, owner y revalidación.

Con 5–8 participantes se reporta `n/N` además del porcentaje y no se generaliza prevalencia.

### Variantes secundarias

Después del camino principal, y sin contaminar su medición:

1. métrica ausente;
2. un solo registro de métrica;
3. conexión perdida al confirmar;
4. fecha civil cambia antes de confirmar;
5. configuración cambia concurrentemente;
6. decisión `Mantener` sin mutación.

Las variantes secundarias son diagnósticas. Research congela antes del piloto una matriz balanceada de `variant_assignment_id`; cada participante ve como máximo una o dos después de cerrar T1–T4. Se registra orden y exposición, se limita este bloque a ocho minutos y no se mezcla su tiempo o resultado con la tarea principal. No es obligatorio que una persona vea todas las variantes y la cobertura se distribuye en la muestra.

Las variantes secundarias no sustituyen las 5–8 ejecuciones completas T1–T4 exigidas por U0 ni permiten estimar diferencias entre escenarios o variantes.

## 16. Criterios de aceptación del prototipo

El prototipo U0 está listo para piloto interno cuando:

- [ ] usa exactamente el escenario sintético asignado y muestra su ID solo al equipo;
- [ ] el harness tiene entrada separada, fixtures inmutables, red denegada y cero imports de repositorios/RPC/auth/almacenamiento productivo;
- [ ] representa los tres pasos y recibo de este documento;
- [ ] incluye las cinco condiciones de métrica definidas en el alcance;
- [ ] no preselecciona compromiso ni decisión;
- [ ] la reflexión puede quedar vacía sin bloquear el CTA;
- [ ] `Mantener` no crea un cambio ficticio;
- [ ] `Reducir`, `Aumentar` y `Sustituir` producen preview antes/después;
- [ ] siempre muestra fecha civil exacta y zona del plan en confirmación;
- [ ] el rollover invalida el preview anterior;
- [ ] error/offline no borra el input visible ni muestra falso éxito;
- [ ] texto al 200% no trunca CTA, opciones o fecha;
- [ ] VoiceOver/TalkBack recorre el camino en orden y anuncia radio/errores/recibo;
- [ ] los labels no duplican rol ni estado y el contraste AA se verifica en el artefacto navegable;
- [ ] analítica, telemetría, credenciales, red y datos reales están ausentes mediante comprobación reproducible;
- [ ] UX Researcher puede registrar todos los campos de la sección 15;
- [ ] Product, UX y Privacy aprueban la versión antes del piloto contabilizable.

## 17. Criterios futuros de implementación

No forman parte de este cambio documental. Si U0 valida el concepto, U1 necesitará como mínimo:

### Product + UX

- congelar orden, términos, obligatoriedad de reflexión y semántica de cada decisión;
- decidir si la métrica se muestra por defecto o bajo expansión;
- resolver qué ocurre al querer cambiar más de un compromiso;
- resolver sustitución y cierre de ciclo.

### Backend + Data

- contrato transaccional/idempotente para Revisión + ajuste;
- derivación autoritativa en servidor de fecha civil/zona y comparación transaccional de fecha/versión esperadas antes de cualquier escritura;
- ownership/RLS y aislamiento A/B;
- control de versión y conflicto;
- semántica de lineage en sustitución;
- exportación, borrado y retención del borrador/recibo;
- decidir si el resumen histórico se congela o se deriva al leer.

### Mobile + Offline

- alcance del borrador por cuenta/plan/semana;
- purga en logout, cambio de cuenta y eliminación;
- recuperación tras cierre de app solo si existe almacenamiento aprobado;
- guardas por rollover de fecha/zona y foreground;
- ningún falso éxito ante respuesta perdida.

### QA + Accessibility + Security

- tests de `keep` sin versión duplicada;
- tests D+1 en Panamá, DST y cambio de zona;
- conflicto con edición futura y dos dispositivos;
- respuesta perdida, reintento e idempotencia;
- lector de pantalla, texto 200%, teclado, teléfono pequeño y reduce motion;
- cero contenido privado en logs, errores o analítica;
- journeys nativos en al menos un dispositivo iOS y Android.

## 18. Preguntas que U0 o arquitectura deben resolver

| ID | Pregunta | Owner de decisión | Bloquea |
|---|---|---|---|
| UX02-D01 | ¿La reflexión sigue opcional? | Product + UX + Privacy | U1 copy/validación |
| UX02-D02 | ¿Compromiso antes de decisión es el orden correcto? | Product + UX Research | U1 flujo |
| UX02-D03 | ¿“Reducir/Aumentar” se entiende sin presión y qué dimensiones permite cada acción? ¿`Aumentar` puede seguir significando solo añadir días? | Product + Content + UX Research | U1 semántica/copy |
| UX02-D04 | ¿La métrica aporta y dónde debe aparecer? | Product + UX Research | U1 jerarquía |
| UX02-D05 | ¿Sustituir conserva lineage o crea uno nuevo enlazado? | Product + Domain/Data | Persistencia |
| UX02-D06 | ¿Revisión y ajuste se guardan de forma atómica? | App API + Database | Integridad |
| UX02-D07 | ¿Qué estado se exporta/retiene de un borrador? | Privacy + Data | Persistencia offline/server |
| UX02-D08 | ¿Cómo se maneja un plan que termina antes de D+1? | Product + Domain | Edge case |
| UX02-D09 | ¿Se permite ajustar más de un compromiso en una revisión futura? | Product | Fuera de MVP actual |

## 19. Gate y handoff

- **Roles activados:** App Product Designer, App Interaction Designer, React Native Developer, QA de lógica y aislamiento.
- **Entregable:** contrato UX-02 y prototipo Expo navegable `UX02-PROT-v0.2`, separados de la app productiva.
- **Evidencia usada:** PRD, plan maestro, pantalla actual, protocolo U0, fixtures A/B inmutables, 11/11 contratos UX-02, 175/175 pruebas completas, config nativa resuelta sin permisos Android activos, Expo Doctor 18/18 y exports Hermes Android/iOS.
- **Evidencia no disponible:** conducta, comprensión, tiempo o preferencia de usuarios.
- **Estado UX-02 de diseño:** prototipo navegable implementado; pendiente de aprobación Product/UX/Privacy y preflight nativo antes de cualquier piloto contabilizable.
- **Estado UX-02 productivo:** bloqueado hasta completar U0 y resolver UX02-D01 a D08 según owner.
- **Gate U0:** no iniciado; este documento no cambia 0/12–15 entrevistas ni 0/5–8 pruebas.
- **Siguiente rol:** Product/Privacy y Mobile Accessibility QA para el preflight; UX Researcher para el piloto solo si se aprueba; App API + Data solo después de la decisión U0.

### 19.1 Evidencia y límites del artefacto navegable

- El código vive bajo `prototypes/ux02`, con `app.json`, paquete, fixtures, modelo y entrada propios.
- La suite rechaza imports productivos, días duplicados o desconocidos, target ajeno, recibos sin confirmación, conflictos sin cambio de versión y cualquier pérdida de la acción mínima de sustitución. El envelope completo de sesión se coteja con fixtures canónicos; fuente, fecha, reflexión o conflicto adulterados fallan antes de renderizar.
- `Reducir` cubre menos días, acción mínima más pequeña o ambos; `Aumentar` conserva su alcance versionado de añadir días.
- El conflicto recarga una fuente sintética v2 realmente distinta; rollover mueve de forma coherente el corte histórico al martes 14 y la vigencia al miércoles 15.
- El bundle de producción instala antes de Expo un preflight inmutable que hace fallar `fetch`, `XMLHttpRequest` y `WebSocket`; Android bloquea además `INTERNET`, lectura y escritura de almacenamiento externo en el manifest del artefacto independiente.
- Expo Go se muestra honestamente como preview con red del contenedor disponible y nunca cuenta como sesión U0.
- No existen campos de texto libre: reflexión, reducción de acción mínima y sustitución usan opciones sintéticas inmutables, y el estado se reinicia entre recorridos. El piloto sigue bloqueado hasta probar un binario instalado, iOS/Android, VoiceOver/TalkBack y texto al 200%.
- Los exports JavaScript Android/iOS pasan; no equivalen a APK/IPA firmados ni aportan evidencia con usuarios.
