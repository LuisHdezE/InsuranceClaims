# Operator Login R3 — candidate contract-exact

## Decisión
**CORE / MANTENER Y PULIR**.

Login es la puerta única del staff. No es un módulo de gestión de identidad ni un selector de roles.

## Contrato real
- Endpoint: `POST /api/v1/operator/auth/login`.
- Input: `login` y `password`.
- `login`: requerido, hasta 160 caracteres en la UI.
- `password`: requerido, hasta 256 caracteres en la UI.
- Response: `accessToken`, `tokenType = Bearer`, `expiresIn = 900`, `operator`.
- Roles publicados: `CLAIMS_OPERATOR`, `CLAIMS_SUPERVISOR`, `PLATFORM_ADMIN`.
- No existe refresh token en este contrato.

## Resolución de navegación
- Si existe una ruta solicitada previa y el rol puede acceder, se respeta esa ruta.
- Si no existe o no está autorizada, se usa la ruta segura por defecto.
- `CLAIMS_OPERATOR` y `CLAIMS_SUPERVISOR`: Dashboard cuando tienen permisos de Claims + Tasks.
- `PLATFORM_ADMIN`: Workspace.
- El rol lo emite el API; la UI no ofrece selector manual de rol.

## UX canónica
- Mantener aviso visible de caso técnico no oficial y datos sintéticos.
- Identidad visual coherente con Operations R3 y paleta navy/azul.
- Un único formulario con Usuario y Contraseña.
- Botón `Ingresar`, deshabilitado durante submit y texto `Autenticando…`.
- Errores del API se presentan mediante `OperatorApiErrorNotice` / Problem Details.
- Tras éxito, la contraseña se limpia y se inicia la sesión.
- Mantener enlace `Volver al sitio público`.
- Responsive compacto, sin perder campos ni mensajes esenciales.

## No debe inventar
- `Recuérdame`.
- `Olvidé mi contraseña` o recuperación de cuenta.
- Registro de usuarios.
- Selector de rol.
- MFA / OTP.
- SSO / Google / Microsoft / Apple login.
- Refresh token o renovación automática de sesión.
- Biometría.
- Enlaces de administración de usuarios desde Login.

## Seguridad visual
La referencia puede explicar que la sesión es JWT Bearer de 900 segundos y que los permisos derivan del rol, pero estos detalles no deben competir visualmente con el formulario. La autenticación y autorización siguen siendo responsabilidad del API.
