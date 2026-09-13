# Claims Workspace Responsive — Referencia aprobada R3

Estado: APROBADA
Fecha de aprobación: 2026-09-12
Capability: Claims Workspace
Decisión de alcance: CORE

## Relación con la referencia desktop

Esta referencia complementa `claims-workspace-kanban-approved.jpg`. No crea una capacidad distinta: define cómo debe adaptarse la misma experiencia Kanban/Listado a pantallas móviles.

## Composición aprobada

### Desktop

- Sidebar lateral compacta.
- Cabecera con búsqueda global, notificaciones y perfil.
- Título y acciones en una franja de baja altura.
- Conmutador Kanban / Lista.
- Filtros compactos en una sola fila cuando el viewport lo permita.
- Cuatro grupos visuales: Reportados, En gestión, Requiere información y Resueltos.
- Tarjetas compactas con código, póliza, vehículo, tipo de incidente, fecha, cliente y contadores relevantes.
- Sin drag & drop.

### Móvil

- Cabecera compacta con marca, notificaciones y perfil.
- Búsqueda visible sin consumir altura excesiva.
- Conmutador Kanban / Lista.
- Filtros secundarios plegados o condensados.
- Grupos del Kanban convertidos en secciones/accordions verticales para evitar scroll horizontal obligatorio.
- Solo el grupo activo despliega sus tarjetas.
- Acción principal de nuevo siniestro accesible sin desplazar demasiado contenido.
- Navegación inferior compacta para las áreas principales.

## Reglas visuales obligatorias

- Interfaz visible en español.
- Alta densidad informativa sin saturación.
- Tipografía contenida.
- Márgenes y paddings moderados.
- Mantener coherencia visual con el Tablero de Operaciones aprobado.
- No inventar acciones que no estén soportadas por la aplicación o la API.
- ClaimStatus y Operational Pipeline siguen siendo conceptos distintos.

Esta referencia fue aprobada explícitamente por Luis y debe considerarse parte del baseline visual canónico R3.