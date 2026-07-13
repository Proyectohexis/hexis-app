# Smoke Android físico — HEXIS

**Fecha:** 12 de julio de 2026
**Resultado:** `PASS limitado` para carga y render inicial
**Gate Q1:** continúa bloqueado

## Alcance comprobado

- dispositivo Android físico en la misma red privada que el equipo de desarrollo;
- Expo Go compatible con SDK 54;
- Metro por LAN en `192.168.0.6:8081`;
- recepción del manifest y bundle Android;
- confirmación del propietario de que HEXIS abrió y funcionó después del reintento.

No se inventariaron todavía el modelo del teléfono, versión de Android ni versión exacta de Expo Go. No existe captura post-render anexada; la evidencia principal es la confirmación directa del propietario y los logs locales de Metro.

## Incidente de carga

El primer intento quedó visible en `Bundling 48%` a las 19:15. La inspección confirmó que Metro ya no escuchaba en el puerto 8081. Se reinició como proceso persistente a las 19:17, se precalentó el bundle completo y se verificó:

- `packager-status:running` por loopback y LAN;
- bundle Android HTTP 200, 1,247 módulos y aproximadamente 7.8 MB;
- conexiones activas desde el teléfono `192.168.0.3`;
- segundo bundle servido desde caché sin errores;
- confirmación posterior del propietario: “funciona correctamente”.

La evidencia respalda que el atasco provenía de la interrupción del proceso Metro anterior, no de un error de compilación de HEXIS.

## Pendientes del smoke funcional

- [ ] relanzamiento en frío, caliente y reload;
- [ ] conectividad real a Supabase desde el teléfono;
- [ ] registro, confirmación, login, logout y recuperación PKCE;
- [ ] onboarding, Hoy, check-in, retractación y revisión semanal;
- [ ] offline, reconexión, cola, reintento y reinicio;
- [ ] recordatorios, permisos, pausa/archivo, tap, reboot y cambio de zona;
- [ ] exportar/abrir JSON y eliminar una cuenta temporal;
- [ ] TalkBack, texto máximo, orientación y teléfono pequeño;
- [ ] rendimiento, crashes, reinstalación y actualización;
- [ ] APK EAS firmado y matriz Android;
- [ ] iOS físico.

## Veredicto

El dispositivo prueba que el proyecto puede entregarse y renderizar mediante Expo Go. No prueba que el binario de release, los flujos P0 o el Gate Q1 estén aprobados.
