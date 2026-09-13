# Staff Workspace R3 — candidate contract-exact

## Decisión
**MANTENER / SIMPLIFICAR**.

Staff Workspace no es un segundo dashboard ni un duplicado del sidebar. Es un launchpad consciente del rol para entrar a las capacidades R3 realmente autorizadas y productizadas.

## Caso visual principal
La referencia usa `PLATFORM_ADMIN` porque es el caso donde Workspace demuestra mejor su responsabilidad: Platform Admin dispone de capacidades de supervisión/plataforma, pero no hereda operación de negocio.

### Debe mostrar para PLATFORM_ADMIN
- Analytics (`claims.analytics.read`).
- Pipelines (`pipelines.admin`).
- Communication Templates (`communications.admin`).
- Custom Fields (`custom_fields.admin`).
- Guidance (`guidance.admin`).
- Automations (`automations.admin`).
- Governed Imports (`imports.execute`).
- Recovery (`operations.integration.read` + `operations.dead_letters.read`).

### No debe mostrar como acceso operativo heredado
- Siniestros / Claims Workspace.
- Tareas.
- Clientes.
- Pólizas.
- Renovaciones.
- Cobranzas.

## Reglas UX
- Sidebar navy oscuro, consistente con las referencias R3 aprobadas.
- Español visible al usuario.
- Identidad y rol visibles sin dominar la pantalla.
- Agrupar capacidades por responsabilidad: Supervisión, Configuración de plataforma y Operación técnica.
- No presentar tarjetas sin enlace como si fueran funciones utilizables.
- No convertir Workspace en un dashboard de métricas ni repetir toda la navegación.
- La UI anticipa el acceso; la autorización real sigue siendo responsabilidad del API.
- `PLATFORM_ADMIN` no es un superusuario operativo implícito.

## Responsive
La versión móvil conserva las mismas capacidades y reglas de acceso, reordenadas en tarjetas compactas. No elimina información contractual relevante.
