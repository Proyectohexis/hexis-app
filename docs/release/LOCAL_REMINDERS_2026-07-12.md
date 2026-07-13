# Recordatorios locales — HEXIS

**Estado:** implementación, guardrails P0 y pruebas de dominio completas; QA nativo pendiente.

## Contrato de producto

- Guardar una hora no solicita permisos.
- El usuario activa cada recordatorio explícitamente desde Disciplina.
- Si rechaza el permiso, el compromiso sigue funcionando y se ofrece abrir Ajustes.
- Cada día programado genera avisos one-shot con fecha, dentro de un horizonte rodante máximo de 21 días; no se crean recurrencias semanales sin fin.
- Pausar conserva la preferencia y limita la versión vigente hasta `ends_on`; reactivar reconstruye el horizonte de la nueva versión.
- Editar conserva solo las ocurrencias válidas de la versión actual; archivar o quitar la hora elimina la preferencia cuando el cierre entra en vigor.
- Planificar o quitar un descanso reconcilia inmediatamente `excluded_dates`; un día excluido no conserva su one-shot.
- Tocar el aviso abre la pestaña Hoy.
- Un control global pausa todos los avisos sin borrar las preferencias individuales.
- Quiet hours editables usan inicio inclusivo y fin exclusivo; la ventana puede cruzar medianoche.
- HEXIS programa como máximo dos avisos por weekday entre todos los compromisos.
- El límite anterior deja un techo interno verificable de 42 one-shots pendientes dentro de cada horizonte.
- Si HEXIS detecta al iniciar o reanudar que cambió la zona del dispositivo, cancela y exige confirmación explícita antes de reprogramar.

Una transición efectiva en D+1 nunca conserva un aviso viejo posterior a D aunque la app quede cerrada. La configuración de la versión nueva se programa al abrir o reanudar HEXIS en D+1; si la app no se abre durante 21 días, el horizonte se agota de forma segura y se renueva en el siguiente inicio.

## Privacidad

El contenido del sistema no incluye nombre del hábito, identidad, meta, notas, métricas ni correo. Solo muestra “Momento de tu protocolo” y “Abre HEXIS cuando estés listo para actuar”. Android usa un canal privado, sin badge ni sonido.

No se obtienen tokens push, no hay FCM/APNs server-side y no se registra analítica de aperturas.

## Precisión

HEXIS no declara alarmas exactas ni solicita `SCHEDULE_EXACT_ALARM`. El sistema operativo puede diferir avisos por ahorro de batería, enfoque o preferencias del usuario. El horizonte acotado prioriza no enviar avisos obsoletos sobre mantener recurrencias indefinidas.

Con la app completamente terminada, el sistema no permite que este JavaScript detecte un cambio de zona y cancele de inmediato un one-shot ya registrado. La cancelación ocurre en el siguiente inicio; el contenido permanece genérico y el caso sigue dentro de la matriz física pendiente.

## Matriz pendiente en dispositivos

- [ ] Android 13+ permiso concedido, rechazado y bloqueado.
- [ ] Android Doze, reinicio y cambio de zona horaria.
- [ ] iOS autorizado, provisional, denegado y Focus/Silencio.
- [ ] Edición, pausa, reactivación, archivo, transición D/D+1 con app cerrada y tres compromisos simultáneos.
- [ ] Apertura en frío y en segundo plano hacia Hoy.
- [ ] Fuente máxima, TalkBack/VoiceOver y orientación.

Referencia oficial: https://docs.expo.dev/versions/v54.0.0/sdk/notifications/
