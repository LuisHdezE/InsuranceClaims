# InsuranceClaims R3 — Referencias visuales canónicas

Este directorio conserva las vistas **aprobadas explícitamente** durante la racionalización visual de InsuranceClaims R3.

## Reglas visuales obligatorias

- Interfaz visible al usuario en **español**.
- Diseño atractivo, profesional y orientado a operaciones.
- Alta densidad útil de información sin saturación.
- No desperdiciar viewport con títulos sobredimensionados, paddings ornamentales o márgenes excesivos.
- Cabeceras, KPIs, filtros, tablas y tarjetas deben ser compactos.
- Cada bloque debe justificar el espacio que ocupa.
- Mantener jerarquía visual clara y accesibilidad.
- No inventar capacidades que el producto o la API no soporten.
- No simular drag & drop en Claims Workspace.
- Claim Lifecycle y Operational Pipeline siguen siendo conceptos distintos.
- Los detalles técnicos de concurrencia, versiones, IDs o claves internas no deben dominar la UI normal del operador.

## Flujo de aprobación

1. Se define la responsabilidad funcional de la vista.
2. Se genera una referencia visual.
3. Luis la revisa y aprueba o solicita ajustes.
4. Solo las vistas aprobadas se guardan aquí como baseline canónico.
5. La implementación posterior debe compararse contra estas referencias sin violar las capacidades reales del sistema.

## Vistas aprobadas

| Vista | Estado | Archivo |
|---|---|---|
| Tablero de Operaciones | APROBADA | `operations-dashboard-approved.svg` |

## Baseline funcional asociado

### Tablero de Operaciones

Responsabilidad: **priorizar**. Responde a la pregunta: **¿qué requiere atención?**

Debe conservar:

- Siniestros abiertos.
- Tareas abiertas.
- Tareas vencidas.
- Evidencia pendiente de revisión.
- Ventana temporal y actualización.
- Distribución por etapa operacional.
- Siniestros recientes.
- Tareas que requieren atención.
- Navegación hacia Claims y Tasks.
- Respeto de permisos/RBAC.

`Reportados en ventana` y `Siniestros cerrados` pueden mantenerse como información secundaria sin competir con los cuatro KPIs operativos principales.
