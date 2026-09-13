# Recovery Operations R3 — referencia aprobada

## Responsabilidad

Diagnosticar eventos de integración por `eventId` y recuperar trabajos en dead-letter sin mezclar esta capacidad con la operación normal de Claims ni con Importaciones Gobernadas.

## Contrato visible

### Integration Event
- Consulta únicamente por `eventId` UUID.
- No existe búsqueda textual ni directorio administrativo de Integration Events.
- Proyección: `eventId`, `externalEventId`, `eventType`, `ingestionStatus`, `processingStatus`, `acceptedAt`, `processedAt`, `failureCategory`.

### Dead-letter queue
- Listado con paginación de servidor.
- R3 no publica filtros por job type, categoría o fecha.
- Proyección: `deadLetterId`, `jobType`, `status`, `attemptCount`, `maxAttempts`, `availableAt`, `correlationId`, `failureCategory`, `completedAt`, `version`.

### Acciones gobernadas
- `operations.dead_letters.read`: inspección.
- `operations.dead_letters.manage`: habilita `Requeue para nuevo intento` y `Resolver administrativamente`.
- Ambas mutaciones envían `expectedVersion`.
- Un `409` fuerza refetch de la proyección autoritativa. No se reintenta automáticamente una mutación con versión obsoleta.

## Regla visual

La consola mantiene el ADN R3 aprobado: sidebar navy oscuro, UI compacta en español, contenido denso pero legible, desktop + móvil y sin exponer payloads internos o controles inexistentes.

## Referencia

`recovery-operations-approved.svg`
