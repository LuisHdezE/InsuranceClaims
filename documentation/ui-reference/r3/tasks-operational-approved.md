# Tareas operativas — Referencia visual aprobada R3

Estado: APROBADA
Fecha de aprobación: 2026-09-12
Capability: Tasks Workspace / Task Operations
Decisión de alcance: CORE

## Objetivo funcional

Permitir al operador localizar, priorizar, gestionar y cerrar trabajo operativo asociado a siniestros, manteniendo separada la tarea del estado del Claim.

## Capacidades reales consideradas

- Filtro por estado, tipo, prioridad y vencidas.
- Búsqueda textual sobre los resultados cargados.
- Vista de cola de trabajo con acceso al detalle.
- Completar una tarea abierta desde el workspace.
- En detalle: modificar prioridad, vencimiento y asignación cuando el rol lo permite.
- Acción rápida `Asignarme`.
- Completar o cancelar una tarea con razón canónica.
- Control de concurrencia/versión conservado por el servidor.
- Completar o cancelar una tarea no cambia automáticamente el ClaimStatus.

## Composición visual aprobada

- Interfaz visible en español.
- UI compacta, profesional y de alta densidad informativa.
- Sidebar y cabecera coherentes con el resto del baseline R3.
- Resumen de cola mediante pestañas/contadores compactos.
- Filtros en una sola franja cuando el viewport lo permita.
- Lista de tareas con título, Claim, prioridad, vencimiento y contexto visible.
- Panel de detalle integrado en desktop para reducir cambios de contexto.
- En móvil, lista y detalle se presentan de forma vertical/condensada, sin sidebar lateral.
- Acción principal de completar tarea claramente visible.

## Reglas de UX y dominio

- La Task es una unidad de trabajo operacional, no un sinónimo del estado del siniestro.
- No mostrar IDs técnicos o versiones como información protagonista.
- La asignación manual por UUID no forma parte del UX final deseado.
- Mantener `Asignarme` como acción válida.
- La selección amigable de otro operador queda documentada como posible evolución de contrato/UI; no se inventa mientras no exista soporte canónico.
- No inventar checklist, comentarios, adjuntos o estados intermedios si no están expuestos realmente por el contrato actual.
- Las acciones terminales de completar y cancelar deben seguir siendo explícitas y auditables.

## Referencia gráfica

Archivo canónico previsto: `tasks-operational-approved.jpg`

La referencia aprobada corresponde al diseño desktop + móvil revisado con Luis. La implementación real debe conservar el ADN visual R3: español, densidad alta, tipografía contenida, paddings moderados y máximo aprovechamiento del viewport.
