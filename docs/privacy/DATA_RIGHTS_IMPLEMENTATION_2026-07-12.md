# Derechos de datos — implementación HEXIS

**Estado:** implementado y validado E2E en Supabase oficial local; bloqueado para uso real hasta desplegarlo en un proyecto dev inventariado, probar el flujo físico y aprobar política/retención.

## Exportación

`public.export_current_account()` devuelve un snapshot JSON versionado y limitado a `auth.uid()`. Incluye perfil, planes, versiones de compromisos, eventos, excepciones, métrica, entradas, revisiones y datos legacy propios. Incluye tombstones para que la copia no oculte historial auditado. Cada objeto se construye con una allowlist explícita; no usa `to_jsonb(row)` y excluye `client_operation_id` y `request_fingerprint` para que una columna interna futura no aparezca accidentalmente.

El cliente valida el formato, escribe un archivo temporal dentro del cache privado, abre el menú nativo para guardarlo/compartirlo y elimina después el archivo temporal. No sube la exportación a otro servicio ni la envía a analítica.

## Eliminación

La Edge Function `delete-account` exige simultáneamente:

- JWT válido del usuario;
- contraseña actual revalidada contra el mismo `user.id`;
- frase exacta `ELIMINAR HEXIS`;
- `operationId` UUID válido;
- petición `POST` de tamaño acotado.

Solo la función recibe `SUPABASE_SERVICE_ROLE_KEY`. El cliente nunca la conoce. La función ignora cualquier identificador de usuario enviado por el cliente y elimina exclusivamente al caller autenticado mediante `auth.admin.deleteUser(caller.id, false)`. Las FKs `ON DELETE CASCADE` eliminan los datos objetivo; HEXIS todavía no usa Storage.

Para reconciliar una respuesta HTTP perdida, la función crea un recibo server-only antes del borrado. El recibo contiene únicamente `user_id`, `operation_id`, estado y timestamps; tiene expiración lógica de 24 horas, no se expone a `anon`/`authenticated` y permite que el cliente reintente una sola vez con el mismo `operationId` sin informar un falso fallo después de una eliminación ya completada. Los recibos vencidos se purgan perezosamente en la siguiente operación; antes de producción debe existir además un job de purga con SLA de retención aprobado.

Antes de permitir la acción, la UI bloquea si existe evidencia offline sin conciliar. Tras confirmación del servidor, limpia la cola y recordatorios de esa cuenta y cierra la sesión local.

## Datos que no salen en la exportación

- contraseña y hashes de Auth;
- sesiones y refresh tokens;
- claves de API o secretos;
- recibos internos de `hexis_private`;
- datos de otra cuenta.

## Gates pendientes

- [x] Aplicar las siete migraciones en Supabase oficial local desde cero.
- [x] Ejecutar pgTAP actualizado: 68/68 con aislamiento usuario A/B/anónimo, recibos privados, allowlist de exportación y guardas temporales D/D+1/futuras.
- [x] Servir `delete-account` localmente y completar alta, exportación, eliminación y rechazo del login posterior con una cuenta temporal.
- [x] Probar contraseña incorrecta, caller/credenciales ajenas, body chunked mayor de 4 KiB, Content-Type inválido y respuesta perdida en un harness E2E automatizado.
- [ ] Desplegar en un proyecto dev separado y eliminar una cuenta sembrada.
- [ ] Abrir la exportación en Android/iOS y revisar tamaño, codificación y contenido.
- [ ] Aprobar política de privacidad, retención, contacto y jurisdicciones con asesoría legal.

Referencias oficiales:

- https://supabase.com/docs/guides/functions/auth
- https://supabase.com/docs/reference/javascript/auth-admin-deleteuser
- https://docs.expo.dev/versions/v54.0.0/sdk/filesystem/
- https://docs.expo.dev/versions/v54.0.0/sdk/sharing/
