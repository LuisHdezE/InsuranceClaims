# Analytics R3 — análisis previo a referencia visual

## Decisión

**MANTENER / SIMPLIFICAR** como panel ejecutivo-operacional de lectura agregada.

No convertir Analytics en un módulo BI genérico ni en una segunda versión del Tablero de Operaciones.

## Usuario y permiso

Ruta: `/operator/analytics`.

Permiso requerido: `claims.analytics.read`.

Roles actuales con acceso:
- `CLAIMS_SUPERVISOR`
- `PLATFORM_ADMIN`

`CLAIMS_OPERATOR` no recibe este permiso.

## Fuente autoritativa

Endpoint: `GET /api/v1/operator/analytics/claims`

Input:
- `from`
- `to`

La UI actual ofrece ventanas predefinidas de 7, 30 y 90 días.

## Métricas publicadas por R3

KPIs:
- `openClaims`
- `reportedInWindow`
- `closedClaims`
- `openTasks`
- `overdueTasks`
- `evidencePendingReviewClaims`

Distribución por ClaimStatus:
- `RECEIVED`
- `UNDER_REVIEW`
- `OBSERVED`
- `APPROVED`
- `IN_REPAIR`
- `CLOSED`

Distribución por etapa operacional:
- `stageKey`
- `displayName`
- `count`

Metadatos de procedencia:
- `window.from`
- `window.to`
- `window.semantics = [from,to)`
- `generatedAt`

## Semántica que la UI debe preservar

`reportedInWindow` cuenta Claims creados dentro de `[from,to)`.

Los demás conteos son snapshots calculados al `generatedAt`; no deben reinterpretarse como totales producidos durante la ventana seleccionada.

## Acciones válidas

- Seleccionar ventana 7 / 30 / 90 días.
- Actualizar/refetch.

## Acciones que NO se deben inventar

- Exportar CSV/PDF.
- Drill-down a Claims individuales.
- Filtros por asegurado, póliza, tipo de siniestro o región.
- Comparación con período anterior.
- Forecasting.
- SLA medios, severidad o importes monetarios no publicados.
- Mutaciones de Claims/Tasks desde Analytics.

El diseño no debe asumir acceso a Claims individuales, porque `PLATFORM_ADMIN` puede leer Analytics sin `claims.backoffice.read`.

## Objetivo visual

Una sola vista responsive, compacta y española con:
- cabecera breve;
- control de ventana;
- procedencia/semántica visible pero secundaria;
- seis KPIs;
- distribución por estado;
- distribución por etapa operacional;
- sin gráficos ornamentales ni controles ficticios.

Mantener el ADN R3 aprobado: sidebar navy oscuro, azul primario, tarjetas blancas, alta densidad útil, desktop + móvil.
