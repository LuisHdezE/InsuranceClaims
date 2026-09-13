# Analytics R3 — análisis previo a referencia visual

## Clasificación
**MANTENER / SIMPLIFICAR**.

## Responsabilidad
Panel de lectura agregada para supervisión operacional. No concede acceso implícito a Claims individuales, Tasks ni mutaciones.

## Acceso
Requiere `claims.analytics.read`.

## Contrato real
Fuente: `GET /api/v1/operator/analytics/claims?from=<iso>&to=<iso>`.

La UI actual expone ventanas predefinidas de 7, 30 o 90 días y debe conservar la semántica `[from,to)` devuelta por el servidor.

### KPIs exactos
- `openClaims`
- `reportedInWindow`
- `closedClaims`
- `openTasks`
- `overdueTasks`
- `evidencePendingReviewClaims`

### Distribuciones exactas
- `claimsByStatus` para `RECEIVED`, `UNDER_REVIEW`, `OBSERVED`, `APPROVED`, `IN_REPAIR`, `CLOSED`.
- `claimsByOperationalStage` con `stageKey`, `displayName`, `count`.

### Proveniencia
- `generatedAt`
- `window.from`
- `window.to`
- `window.semantics`

## Regla semántica crítica
`reportedInWindow` cuenta Claims creados dentro de `[from,to)`. Los demás conteos son snapshots calculados al `generatedAt` y no deben reinterpretarse como totales históricos de la ventana.

## No inventar
- Exportación de reportes.
- Drill-down a Claims individuales.
- Comparadores entre períodos.
- Métricas financieras o monetarias.
- SLA, severidad, geografía o ratios no publicados por el endpoint.
- Filtros adicionales a la ventana temporal.
- Mutaciones desde Analytics.

## Referencia visual objetivo
Desktop + móvil con el mismo ADN R3 aprobado: sidebar navy oscuro, azul primario, tarjetas compactas, seis KPIs, dos distribuciones y controles únicamente para ventana 7/30/90 días y actualización manual.
