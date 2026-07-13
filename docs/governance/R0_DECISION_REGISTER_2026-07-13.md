# Registro de decisiones R0 — HEXIS

**Fecha:** 13 de julio de 2026

**Estado:** abierto; no bloquea correcciones locales R1

## Decisiones ya respaldadas

| Decisión | Estado | Evidencia |
|---|---|---|
| Plataforma inicial | Android e iOS con Expo/React Native | Código, PRD y plan maestro |
| Estado del producto | Pre-alpha local; no apto para usuarios/datos reales | Informe y gates vigentes |
| Prioridad inmediata | Integridad local, staging, builds y QA antes de features nuevas | Autorización de ejecución del plan |
| Versión de pre-alpha | `0.1.0` hasta que exista un release candidate aprobado | Estado real y política semántica conservadora |
| Features fuera de alcance | IA, comunidad, pagos, fotos, web y wearables hasta V1 | PRD y plan maestro |
| Secretos | Nunca en `EXPO_PUBLIC_*`, código o repositorio | Arquitectura y política de seguridad |

## Decisiones que requieren al propietario

No deben inferirse porque son permanentes, legales o dependen de cuentas externas.

| ID | Decisión requerida | Propuesta de trabajo, no aprobación | Impacto si queda abierta |
|---|---|---|---|
| GOV-D01 | Nombre legal exacto del titular del copyright | Mantener atribución Expo de terceros y añadir el titular real cuando sea confirmado | Bloquea cierre de GOV-01 |
| GOV-D02 | Licencia del código propio | Elegir explícitamente entre MIT, privada/propietaria u otra revisada por Legal | Bloquea distribución formal del código |
| GOV-D03 | Visibilidad del repositorio | GitHub API confirmó `visibility: public` y rama por defecto `main` el 13 de julio; confirmar si debe permanecer público | Riesgo de exposición no aceptado formalmente |
| GOV-D04 | Identificador Android | Candidato técnico: `com.proyectohexis.hexis` | Bloquea primer build permanente |
| GOV-D05 | Identificador iOS | Candidato técnico: `com.proyectohexis.hexis` | Bloquea primer build permanente |
| GOV-D06 | Publisher y cuentas | Confirmar organización Expo/EAS, Apple Developer y Google Play | Bloquea signing y distribución |
| GOV-D07 | Owners nominales | Producto, Privacidad, Backend, Release y Soporte | Bloquea responsabilidades operativas |

## Reglas mientras están abiertas

- No se escribirán IDs definitivos en `app.json`.
- No se cambiará el régimen de licencia por inferencia.
- No se crearán proyectos remotos ni se usarán datos reales sin inventario y owner.
- Las correcciones locales, tests, CI y documentación pueden continuar.
- Toda excepción de seguridad o privacidad debe quedar registrada y expirar antes de beta.

## Gate G0

**Estado:** parcial.

G0 se cerrará cuando GOV-D01 a GOV-D07 tengan decisión explícita, los accesos estén inventariados y los checks obligatorios de `main` estén configurados.

La protección de `main` no pudo auditarse con GitHub CLI porque no existe una sesión `gh`
autenticada en este entorno. Esto no impide trabajar y hacer `git push` con el helper de
credenciales configurado, pero sí impide presentar branch protection como verificada.
