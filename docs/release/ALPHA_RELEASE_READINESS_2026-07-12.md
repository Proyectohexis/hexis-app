# Preparación de alpha — HEXIS

**Corte:** 12 de julio de 2026
**Veredicto actual:** `NO-GO` para distribución externa; configuración local preparada, credenciales y gates nativos pendientes.

## Perfiles EAS

`eas.json` define:

- `preview`: distribución interna; Android genera APK instalable.
- `production`: Android App Bundle y versiones nativas administradas por EAS con incremento automático.
- `requireCommit`: impide construir desde un árbol sin checkpoint reproducible.

No se añadieron `EXPO_PUBLIC_*` ni secretos dentro de `eas.json`. Las variables de Supabase deberán configurarse por ambiente en EAS y nunca incluir `service_role` o claves secretas.

## Compatibilidad verificada documentalmente

- Expo SDK 54 usa Android `targetSdkVersion 36`, superior al mínimo vigente de Google Play (API 35 para apps móviles nuevas/actualizadas).
- App Store Connect exige iOS 26 SDK desde el 28 de abril de 2026. EAS Build selecciona Xcode 26 para proyectos SDK 54, por lo que el SDK actual puede producir un binario compatible cuando existan cuenta y credenciales.
- La gestión remota de `versionCode`/`buildNumber` con `autoIncrement` evita reutilizar números de build.

Referencias oficiales:

- https://docs.expo.dev/versions/v54.0.0/
- https://docs.expo.dev/build-reference/infrastructure/
- https://docs.expo.dev/build-reference/app-versions/
- https://developer.android.com/google/play/requirements/target-sdk
- https://developer.apple.com/news/?id=ueeok6yw

## Decisiones obligatorias antes del primer build

- [ ] Definir y comprobar disponibilidad del `ios.bundleIdentifier` definitivo.
- [ ] Definir y comprobar disponibilidad de `android.package` definitivo.
- [ ] Confirmar propietario de la cuenta Expo/EAS y organización.
- [ ] Configurar `extra.eas.projectId` mediante `eas init` autenticado.
- [ ] Configurar ambientes EAS separados para desarrollo, preview y producción.
- [ ] Confirmar Apple Developer Team y Google Play Console.
- [ ] Aprobar nombre legal del publicador, política de privacidad y URL de soporte.

Los identificadores no se inventan en el repositorio: se vuelven permanentes para distribución y requieren aprobación del propietario.

## Gate técnico previo a alpha interna

- [x] `npm ci` reproducible.
- [x] Unit tests, Expo Doctor y bundles JavaScript Android/iOS.
- [x] RLS/RPC y pgTAP ejecutados en PostgreSQL 17 del stack oficial local.
- [x] `supabase db reset && supabase test db` con stack oficial Docker: 68/68, incluidos los invariantes temporales D/D+1 y reservas futuras.
- [x] Alta y E2E adverso de privacidad aprobados en Auth/REST/Edge Functions locales: aislamiento, reautenticación, límite real de body, media type, eliminación y respuesta perdida.
- [x] Carga inicial y render de HEXIS confirmados por el propietario en un Android físico mediante Expo Go 54 y Metro por LAN (12-07-2026; smoke de arranque asistido, no build firmado).
- [ ] Build EAS `preview` Android instalado en equipo físico.
- [ ] Build EAS `preview` iOS instalado mediante distribución interna.
- [ ] VoiceOver/TalkBack, fuente máxima, orientación, modo offline y reinstalación.
- [ ] Recordatorios: permiso concedido/denegado, reinicio, cambio de zona y pausa/archivo.
- [ ] Exportación JSON abierta en otra app y eliminación E2E de una cuenta de prueba.
- [ ] Escaneo de secretos, auditoría de dependencias y revisión AppSec final; no hay vulnerabilidades altas/críticas conocidas, pero quedan avisos moderados transitivos.

Esta evidencia valida únicamente la entrega del bundle y el arranque/render inicial en un dispositivo Android. No valida un APK firmado, distribución EAS, una matriz Android, ni los flujos funcionales, offline, privacidad, accesibilidad, rendimiento o notificaciones.

## Rollback

Antes de invitar personas externas:

1. conservar el último artefacto preview aprobado y su commit;
2. documentar migraciones aplicadas y backup/restauración verificados;
3. detener invitaciones si auth, sincronización, eliminación o aislamiento RLS fallan;
4. revertir el cliente al artefacto anterior, sin revertir destructivamente datos;
5. aplicar correcciones de base mediante una migración nueva e idempotente;
6. reejecutar todos los gates antes de reabrir la alpha.

## Go/No-Go

La alpha interna solo será `GO` cuando no queden P0/P1, Supabase oficial pase desde cero, privacidad funcione E2E y exista al menos un build físico probado por plataforma. La beta externa requiere además política legal aprobada, soporte, observabilidad y consentimiento explícito de participantes.
