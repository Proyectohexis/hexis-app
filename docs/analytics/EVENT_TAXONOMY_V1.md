# Taxonomía de eventos de producto v1

**Estado:** implementada como frontera local; recolección deshabilitada.
**Versión:** 1.
**Alcance:** MVP de HEXIS.

## Decisión

HEXIS no conecta actualmente ningún proveedor de analítica. El runtime empieza con un `sink` nulo y cada intento válido devuelve `{ delivered: false, reason: 'disabled' }`. Configurar un destino exige una acción explícita mediante `configureAnalyticsSink(fn)` y una revisión separada de privacidad, consentimiento, retención, residencia de datos y contratos.

La taxonomía mide el embudo de producto sin añadir identificadores, timestamps, IDs de usuario/dispositivo, contenido escrito ni valores físicos. El runtime no imprime eventos ni errores en consola.

## Allowlist exacta

No se aceptan eventos fuera de esta tabla. Todas las propiedades son obligatorias y no se permiten claves adicionales.

| Evento | Propiedades permitidas | Tipo, enum o rango | Momento semántico |
|---|---|---|---|
| `onboarding_started` | `entry_point` | `signup \| resume` | Al entrar al onboarding desde alta o reanudación. |
| `identity_defined` | `definition_mode` | `preset \| custom` | Al persistir una definición; jamás incluye el texto. |
| `plan_created` | `commitment_count`, `reminder_count` | enteros `1..3`, `0..3` | Al confirmar el primer plan. |
| `checkin_recorded` | `completion_level`, `sync_state` | `minimum \| full`, `confirmed \| offline_queued` | Al confirmar o encolar evidencia real. |
| `checkin_sync_failed` | `failure_class`, `retryable`, `attempt_bucket` | `network \| timeout \| server \| conflict \| unknown`; boolean; `first \| retry \| exhausted` | Cuando una sincronización falla, sin mensajes técnicos. |
| `weekly_review_completed` | `decision`, `consistency_band` | `keep \| reduce \| increase \| replace`; `insufficient \| low \| medium \| high` | Al confirmar una revisión semanal. |
| `plan_adjusted` | `adjustment_type`, `active_commitment_count` | `reduce \| increase \| replace \| pause \| reactivate \| archive \| schedule`; entero `0..3` | Al persistir una nueva versión o cambio de estado; cero es válido si todo queda pausado/archivado. |
| `export_requested` | `network_state` | `online \| offline \| unknown` | Ante la intención explícita de exportar. |
| `account_deleted` | `local_cleanup` | `complete \| residuals_detected` | Solo tras confirmación de eliminación remota. |

`paywall_viewed` y `subscription_started` están reservados para una fase posterior y v1 los rechaza.

## Datos prohibidos

La frontera rechaza:

- claves desconocidas o relacionadas con email, nombre, identidad escrita, hábito/compromiso escrito, notas, peso, fotos, métricas o valores físicos;
- IDs de usuario, cuenta o dispositivo, IP, token, contraseña, teléfono o dirección;
- objetos anidados, arrays, accessors y contenedores que no sean objetos planos;
- texto libre o variantes no exactas de los enums;
- patrones de email, URL, UUID, IPv4 o teléfono en cualquier valor textual;
- números no enteros, no finitos o fuera de su rango.

No se truncan ni “limpian” payloads inválidos: se descartan completos. Esta política evita que una futura ampliación accidental envíe campos no revisados.

## Interfaz de runtime

La app importa desde `src/analytics/analytics.js`:

```js
import {
  configureAnalyticsSink,
  trackProductEvent,
  validateProductEvent,
} from './src/analytics/analytics';
```

El destino es una función sync o async que recibe exclusivamente:

```js
{
  name: 'plan_created',
  properties: { commitment_count: 2, reminder_count: 1 },
  taxonomyVersion: 1,
}
```

El objeto y sus propiedades llegan congelados. El destino debe resolver para indicar aceptación, devolver `false` para rechazar o lanzar/rechazar para indicar fallo.

```js
configureAnalyticsSink(async (event) => {
  await approvedAdapter.send(event);
});

const result = await trackProductEvent('checkin_recorded', {
  completion_level: 'full',
  sync_state: 'confirmed',
});
// { delivered: true, reason: 'delivered' }
```

Desactivar es explícito e idempotente:

```js
configureAnalyticsSink(null);
```

Pasar un valor distinto de función o `null` desactiva el destino previo y devuelve `invalid_sink`. Los errores del destino no escapan: `trackProductEvent` responde `sink_failed`. Los eventos inválidos se rechazan antes de consultar el destino.

## Razones observables

`trackProductEvent` siempre resuelve un objeto `{ delivered, reason }`:

- éxito: `delivered`;
- sin destino: `disabled`;
- destino rechazó o falló: `sink_rejected`, `sink_failed`;
- validación: `unknown_event`, `invalid_properties`, `pii_key`, `pii_value`, `unknown_property`, `missing_property`, `nested_value_not_allowed`, `free_text_not_allowed`, `invalid_property_type`, `invalid_property_value`.

Estas razones no contienen claves, valores ni payloads. Si en el futuro se instrumenta observabilidad interna, solo puede agregarse el código de razón, nunca el evento rechazado.

## Gate para habilitar un proveedor

Mantener el sink nulo hasta completar, con evidencia:

1. inventario y finalidad por evento;
2. base legal/consentimiento y controles de opt-out aplicables;
3. evaluación del proveedor, subprocesadores, región y retención;
4. configuración que deshabilite captura automática de pantalla, sesión, IP y device IDs;
5. pruebas de proxy que demuestren que solo sale esta allowlist;
6. actualización de políticas y declaraciones de App Store/Google Play;
7. kill switch remoto y procedimiento de eliminación.
