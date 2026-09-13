# Analytics R3 — referencia aprobada

Estado: **APROBADA**  
Decisión: **MANTENER / SIMPLIFICAR**

## Responsabilidad

Presentar una lectura agregada, autoritativa y operativa de Claims R3 para supervisión. No concede acceso implícito a Claims individuales ni incorpora mutaciones de negocio.

## Contrato visible

- Ventanas permitidas en UI: 7, 30 o 90 días.
- Control de actualización manual.
- Procedencia y `generatedAt` visibles sin dominar la interfaz.
- Semántica de ventana `[from,to)` explícita.

## KPIs

1. Claims abiertos (`openClaims`).
2. Reportados en ventana (`reportedInWindow`).
3. Claims cerrados (`closedClaims`).
4. Tareas abiertas (`openTasks`).
5. Tareas vencidas (`overdueTasks`).
6. Evidencia pendiente de revisión (`evidencePendingReviewClaims`).

## Distribuciones

- `claimsByStatus` por ClaimStatus.
- `claimsByOperationalStage` según la proyección operacional devuelta por el servidor.

## Regla semántica crítica

`reportedInWindow` cuenta Claims creados dentro de `[from,to)`. Los demás conteos son snapshots calculados al `generatedAt`; la UI no debe reinterpretarlos como totales de la ventana.

## Acceso

Requiere `claims.analytics.read`. La capability es de lectura agregada. No añadir drill-down, exportación, comparadores, métricas financieras ni filtros que el contrato R3 no publique.

## Referencia visual

`analytics-r3-approved.svg`
