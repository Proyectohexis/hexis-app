# PRV-01 — Decisión de retención y borrado de entradas métricas

**Fecha:** 2026-07-13
**Estado:** pendiente de decisión y aprobación de Legal/DPO
**Clasificación:** interno y propietario
**Responsables propuestos:** Privacy Engineering, Legal/DPO y Data
**Gate:** bloquea beta con datos reales
**Implementación autorizada:** no; este documento no modifica la política ni la base de datos

## 1. Propósito

Este documento registra el contrato técnico que existe hoy para `metric_entries`, separa los conceptos de ocultar, borrar y exportar, y presenta alternativas para una decisión formal de retención.

No determina una obligación legal ni fija un plazo de conservación. La jurisdicción, la finalidad de cualquier retención, su base jurídica y el texto dirigido al usuario deben ser aprobados por Legal/DPO antes de cambiar el comportamiento.

## 2. Resumen de la decisión pendiente

Cuando una persona pulsa **Eliminar** sobre una entrada métrica, HEXIS actualmente:

1. conserva la fila completa;
2. fija `deleted_at`;
3. la oculta de las lecturas ordinarias autenticadas mediante RLS;
4. conserva su valor, nota y fechas en PostgreSQL;
5. incluye deliberadamente esos datos en la exportación de cuenta.

Por tanto, el comportamiento actual es **ocultación con tombstone**, no borrado del contenido. No existe en las migraciones revisadas un TTL ni un job de purga para estas filas o sus recibos de operación.

La recomendación de Privacy Engineering es adoptar un comportamiento **privacy-first**: borrado físico de la entrada y un recibo idempotente separado, mínimo y temporal. Si Legal/DPO identifica una finalidad que exija conservar constancia, la segunda opción es redactar el contenido inmediatamente y conservar solo un tombstone mínimo durante un plazo explícito.

## 3. Contrato actual verificado

### 3.1 Tabla pública `metric_entries`

| Campo | Contenido actual | Clasificación operativa | Tras el soft delete | Exportación v1 |
|---|---|---|---|---|
| `id` | UUID de la entrada | Identificador interno | Se conserva | Sí |
| `user_id` | UUID de cuenta | Identificador personal | Se conserva | Sí |
| `metric_id` | UUID de la métrica | Relación con una métrica personal | Se conserva | Sí |
| `value` | Valor numérico | Dato personal sensible para el producto | Se conserva sin cambios | Sí |
| `local_date` | Fecha civil informada | Dato temporal de actividad | Se conserva sin cambios | Sí |
| `recorded_at` | Instante de registro | Dato temporal de actividad | Se conserva sin cambios | Sí |
| `note` | Texto libre de hasta 500 caracteres | Contenido privado potencialmente sensible | Se conserva sin cambios | Sí |
| `client_operation_id` | UUID idempotente de creación | Correlador interno | Se conserva | No |
| `request_fingerprint` | MD5 no criptográfico del payload de creación | Derivado interno del payload | Se conserva | No |
| `deleted_at` | Instante del soft delete | Control de ciclo de vida | Se fija al borrar | Sí |
| `created_at` | Instante de creación | Metadato operativo | Se conserva | Sí |
| `updated_at` | Instante de última actualización | Metadato operativo | Se actualiza/conserva | Sí |

Observaciones importantes:

- `value` es `NOT NULL`; una alternativa de redacción que lo convierta en `NULL` requiere cambiar el esquema o trasladar el tombstone a otra tabla.
- `request_fingerprint` se deriva de campos que incluyen valor, fecha, instante y nota. Aunque no contiene el texto en claro y no se exporta, no debe considerarse una anonimización criptográfica.
- `metric_id` permite relacionar la entrada con etiqueta, unidad y tipo de métrica.

### 3.2 Recibos privados de actualización y borrado

`hexis_private.metric_entry_operation_receipts` conserva:

| Campo | Finalidad actual |
|---|---|
| `user_id` | Aislar la operación por cuenta |
| `client_operation_id` | Reconocer un reintento idempotente |
| `operation_type` | Distinguir `update` de `delete` |
| `request_fingerprint` | Detectar reutilización de la clave con otro payload |
| `result_entry_id` | Recuperar el resultado asociado |
| `created_at` | Registrar cuándo se creó el recibo |

La FK de `result_entry_id` usa `ON DELETE CASCADE`. En consecuencia, un hard delete de la entrada también elimina el recibo actual. Mantener idempotencia después de un hard delete exige un recibo de eliminación desacoplado que no contenga valor, nota ni fechas de la medición.

Los recibos están revocados para `public`, `anon`, `authenticated` y `service_role` como acceso directo. Las funciones autorizadas los usan dentro del servidor.

### 3.3 Qué hace `delete_metric_entry`

La función:

- autentica con `auth.uid()`;
- valida `entry_id` y `client_operation_id`;
- toma un advisory lock por usuario y operación;
- verifica que la entrada pertenece al caller;
- fija `deleted_at` solo si todavía es nulo;
- crea un recibo idempotente;
- devuelve la fila, todavía con su contenido, dentro de la respuesta JSON.

Un reintento con la misma operación devuelve el resultado existente. Reutilizar la clave con otro contenido se rechaza.

### 3.4 Qué ve cada superficie

| Superficie | Comportamiento actual |
|---|---|
| Lectura ordinaria de la app | RLS exige `auth.uid() = user_id` y `deleted_at IS NULL`; el tombstone no aparece |
| Base de datos | La fila completa permanece en `metric_entries` |
| Exportación de cuenta | `export_current_account()` es `SECURITY DEFINER`, limita cada relación al caller e incluye el tombstone con `value`, `note`, fechas y `deleted_at` |
| Recibos internos | No salen en la exportación |
| Eliminación completa de cuenta | Borrar el usuario elimina por cascade entradas y recibos asociados |

## 4. Ocultar, borrar y exportar no son equivalentes

### Ocultar

Una política RLS o un filtro de UI impide que la persona vea la fila en la experiencia normal. El contenido sigue almacenado y puede ser accesible por rutas privilegiadas, backups o funciones diseñadas para incluir tombstones.

### Borrar contenido

El borrado físico elimina la fila. La redacción elimina los campos de contenido y conserva únicamente una constancia mínima. Ambos son cambios distintos de ocultar y pueden ser irreversibles.

### Exportar

La exportación es una copia de los datos que el sistema decide entregar al titular. Incluir un tombstone completo demuestra que el contenido sigue retenido; no convierte esa retención en necesaria o aprobada. Cambiar qué representa una eliminación exige revisar y probablemente versionar el formato de exportación.

## 5. Riesgos del comportamiento actual

| Riesgo | Impacto |
|---|---|
| Expectativa incorrecta | La etiqueta “Eliminar” puede interpretarse como borrado cuando solo oculta |
| Minimización insuficiente | Valor y nota se conservan sin un plazo aprobado |
| Exportación sorpresiva | Un dato eliminado en la UI reaparece completo en el archivo exportado |
| Retención indefinida de facto | No existe TTL ni proceso de purga documentado para estas filas |
| Backups y restauración | Una restauración puede prolongar o reintroducir datos si no existe un ledger de borrados |
| Hashes derivados | Los fingerprints no son contenido en claro, pero tampoco equivalen a anonimización |
| Inconsistencia de copy | UI, política y contrato técnico pueden prometer cosas distintas |

## 6. Alternativas de decisión

### Opción A — Hard delete con recibo idempotente mínimo

Al confirmar la eliminación:

1. bloquear y autorizar la entrada dentro de la transacción;
2. crear un recibo de eliminación privado separado;
3. borrar físicamente `metric_entries`;
4. responder solo con un resultado mínimo, por ejemplo identificador, estado y momento de eliminación;
5. purgar el recibo al vencer una ventana operativa aprobada.

El recibo propuesto no debe contener `value`, `note`, `local_date`, `recorded_at`, etiqueta, unidad ni un hash derivado de esos campos. Su clave de conflicto puede derivarse únicamente de `entry_id`, usuario y tipo de operación.

**Ventajas:** coincide mejor con la expectativa de borrar, minimiza exposición y simplifica la exportación futura.
**Costes:** no ofrece restauración, exige rediseñar idempotencia y hace que un rollback de datos borrados sea imposible por diseño.

### Opción B — Redacción inmediata con tombstone mínimo y plazo acotado

Al confirmar la eliminación:

1. eliminar o nulificar valor, nota y fechas de medición;
2. retirar fingerprints derivados del contenido;
3. conservar solo los identificadores estrictamente necesarios, `deleted_at` y el estado mínimo aprobado;
4. purgar el tombstone al vencer un plazo explícito;
5. exportar, si corresponde, solo la constancia mínima y no el contenido eliminado.

Como `value` y varias fechas son actualmente obligatorios, esta opción requiere modificar constraints o mover la constancia a una tabla privada de tombstones.

**Ventajas:** permite demostrar que ocurrió una eliminación durante una ventana definida.
**Costes:** todavía conserva identificadores personales; requiere finalidad, plazo, controles de acceso y copy aprobados.

### Opción C — Mantener el tombstone completo actual

Solo sería aceptable si Legal/DPO documenta una finalidad concreta, base aplicable, plazo, acceso, purga, tratamiento en backups y explicación clara al usuario.

**Recomendación:** no adoptar esta opción por defecto. El comportamiento actual debe considerarse transitorio de pre-alpha, no una política aprobada.

## 7. Recomendación de Privacy Engineering

Adoptar **Opción A** para la eliminación individual de entradas métricas, salvo que Legal/DPO demuestre una necesidad específica de constancia temporal. En ese caso, usar **Opción B** con el mínimo de campos y una expiración obligatoria.

Principios que debe cumplir la decisión final:

- “Eliminar” debe describir con exactitud lo que ocurre.
- Ningún plazo se fija por conveniencia técnica únicamente.
- La idempotencia no justifica conservar el contenido de la medición.
- La exportación no debe reexponer valor o nota que la persona eliminó.
- Los backups deben respetar el borrado mediante expiración y reaplicación de un ledger mínimo.
- El borrado de cuenta debe continuar eliminando todos los datos y recibos asociados.

## 8. Decisiones que Legal/DPO debe responder

1. ¿“Eliminar entrada” significa borrado inmediato e irreversible o existe una ventana de restauración?
2. ¿Qué jurisdicciones y categorías de usuario estarán en alcance para alpha, beta y producción?
3. ¿Existe una finalidad obligatoria para conservar una constancia de eliminación?
4. Si existe, ¿cuál es la base aplicable y el plazo exacto por campo?
5. ¿Qué personal o sistemas pueden acceder al tombstone o recibo?
6. ¿Debe la exportación omitir la entrada o incluir una constancia mínima de que fue eliminada?
7. ¿Qué copy se mostrará antes y después de borrar?
8. ¿Cuál es la ventana máxima necesaria para reconciliar reintentos idempotentes?
9. ¿Cómo se aplicará el borrado a backups y restauraciones?
10. ¿Se permitirá soporte o recuperación manual? Si sí, ¿con qué autenticación, evidencia y auditoría?
11. ¿Qué ocurre con datos ya tombstonados cuando entre en vigor la nueva política?
12. ¿Qué SLA y owner tendrá el job de purga?

## 9. Plan de migración condicionado a aprobación

Ningún paso de esta sección debe ejecutarse hasta cerrar las preguntas anteriores.

### Fase 0 — Contrato aprobado

- Aprobar matriz dato–finalidad–retención–borrado.
- Aprobar copy, política, exportación y tratamiento de backups.
- Definir owner operativo, alertas y SLA de purga.
- Versionar el contrato RPC y el esquema de exportación si cambia su significado.

### Fase 1 — Preparación técnica

- Inventariar cantidad y antigüedad de tombstones con métricas agregadas, sin registrar contenido.
- Crear la estructura privada de recibo de eliminación mínimo y con `expires_at`.
- Separar recibos de actualización de recibos de eliminación.
- Evitar que el recibo de hard delete dependa por FK de la fila que será eliminada.
- Mantener `auth.uid()`, aislamiento A/B, advisory lock y conflicto por reutilización de operación.
- Definir un job idempotente de purga con observabilidad sin PII.

### Fase 2 — Cambio de función y exportación

- Cambiar `delete_metric_entry` según la opción aprobada.
- Devolver una respuesta mínima que no reexponga contenido borrado.
- Actualizar el repositorio móvil y el copy de confirmación.
- Incrementar `schema_version` de la exportación si se elimina o cambia la forma de los tombstones.
- Mantener compatibilidad de lectura o documentar explícitamente la ruptura.

### Fase 3 — Datos existentes

- Aplicar la decisión aprobada a tombstones previos: purga o redacción.
- No crear copias ad hoc para “rollback”. Cualquier snapshot temporal requiere acceso restringido, expiración y aprobación expresa.
- Verificar por conteos y checksums estructurales; no escribir valores o notas en logs.

### Fase 4 — Rollout

- Validar primero en Supabase dev y staging con datos sintéticos.
- Ejecutar una ventana controlada con rollback de código disponible antes de la purga.
- Habilitar alertas por fallos del RPC y atraso del job de purga.
- Publicar la política y el copy aprobados antes de aceptar datos reales.

## 10. Rollback y restauración

El despliegue de código y la eliminación de contenido tienen propiedades distintas:

- **Antes de purgar o redactar:** se puede revertir el routing/RPC si la migración fue aditiva y la escritura nueva está detenida.
- **Después de hard delete o redacción:** el contenido no tiene rollback funcional; esa irreversibilidad es parte del contrato de borrado.
- **Restauración de backup:** no debe reintroducir datos eliminados. El runbook debe reaplicar un ledger mínimo de borrados antes de abrir tráfico.
- **Fallo parcial:** función, recibo y borrado deben vivir en una sola transacción o fallar juntos.

Un backup de emergencia no debe convertirse en una retención paralela indefinida. Su ciclo de vida y acceso forman parte de la decisión Legal/DPO.

## 11. Pruebas requeridas

### Base de datos y seguridad

- usuario A elimina exclusivamente su entrada;
- usuario B y `anon` no pueden leer, borrar ni inferir la entrada;
- el mismo `client_operation_id` devuelve un resultado idempotente sin restaurar contenido;
- reutilizar la operación para otra entrada produce conflicto;
- dos sesiones concurrentes del mismo usuario convergen al mismo resultado;
- una actualización no puede revivir una entrada eliminada;
- hard delete o redacción ocurre en la misma transacción que el recibo;
- el recibo no contiene valor, nota, fechas de medición ni hash derivado de esos campos;
- el job purga exactamente al vencer el plazo aprobado;
- borrar la cuenta elimina también tombstones y recibos.

### Exportación y privacidad

- la exportación nueva omite el contenido eliminado;
- el `schema_version` y la allowlist coinciden con el contrato aprobado;
- no aparecen `client_operation_id`, fingerprints ni campos internos;
- un snapshot A nunca contiene datos de B;
- no se registran valores, notas o payloads en logs y errores.

### Cliente y experiencia

- la confirmación describe irreversibilidad y plazo real;
- un éxito ambiguo de red reintenta sin duplicar ni resucitar;
- la entrada desaparece al confirmar el servidor;
- exportar después de borrar refleja el contrato nuevo;
- accesibilidad, error, retry y estado de carga funcionan en Android/iOS.

### Operaciones

- prueba de backup/restore con reaplicación de borrados;
- alerta cuando la purga supera su SLA;
- runbook de fallo parcial y reconciliación;
- evidencia de ejecución en dev/staging antes de beta.

## 12. Criterios de aceptación del gate PRV-01

PRV-01 se considera cerrado solo cuando existan:

- [ ] decisión firmada por Legal/DPO y Privacy;
- [ ] matriz de retención por campo y finalidad;
- [ ] copy y política consistentes con el comportamiento;
- [ ] diseño de recibo mínimo y expiración aprobados;
- [ ] migración y rollback revisados por Data/Security;
- [ ] suite de seguridad, privacidad, concurrencia y exportación verde;
- [ ] job de purga con owner, SLA y alertas;
- [ ] prueba de backup/restore que no reintroduce datos eliminados;
- [ ] evidencia en dev/staging con datos sintéticos.

**Estado del gate al 2026-07-13:** bloqueado; no existe aprobación Legal/DPO ni plazo formal.

## 13. Evidencia técnica revisada

- [`supabase/migrations/202607120001_target_domain_model.sql`](../../supabase/migrations/202607120001_target_domain_model.sql): esquema, constraints, grants y RLS de `metric_entries`.
- [`supabase/migrations/202607120003_metric_operations.sql`](../../supabase/migrations/202607120003_metric_operations.sql): recibos, edición y soft delete.
- [`supabase/migrations/202607120004_account_privacy_operations.sql`](../../supabase/migrations/202607120004_account_privacy_operations.sql): exportación v1 y allowlist de tombstones.
- [`supabase/tests/rls_target_model_test.sql`](../../supabase/tests/rls_target_model_test.sql): expectativas actuales de tombstone, ocultación y exportación.
- [`src/data/repositories/metricRepository.js`](../../src/data/repositories/metricRepository.js): contrato del cliente.
- [`docs/privacy/DATA_RIGHTS_IMPLEMENTATION_2026-07-12.md`](DATA_RIGHTS_IMPLEMENTATION_2026-07-12.md): estado general de exportación y eliminación de cuenta.

## 14. Handoff

**Siguiente rol:** Legal/DPO, con Privacy Engineering y Data como soporte técnico.
**Decisión solicitada:** elegir Opción A u Opción B, responder las doce preguntas y aprobar plazo/copy.
**Bloqueo mínimo:** sin esa aprobación no se debe migrar la política, aceptar métricas reales en beta ni presentar el soft delete actual como borrado del contenido.
