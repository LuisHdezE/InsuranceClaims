# Directorio de Clientes R3 — aprobado

## Decisión
**MANTENER / SIMPLIFICAR**.

El Directorio de Clientes es una bandeja de búsqueda y selección. No duplica Cliente 360 y no introduce edición ni acciones de negocio inexistentes.

## Contrato real
- Endpoint: `GET /api/v1/operator/customers`.
- Permiso de presentación: `customers.read`.
- Filtros soportados: `search`, `status`, `page`, `pageSize`.
- Estados: `ACTIVE`, `INACTIVE`.
- Page size actual de la UI: `25`.

## Campos visibles por fila
- `displayName`.
- `customerRef`.
- `status`.
- `policyCount`.
- `claimCount`.
- `version`.
- `updatedAt`.

## Acciones permitidas
- Buscar.
- Filtrar por estado.
- Restablecer filtros.
- Actualizar/refetch.
- Paginación anterior/siguiente.
- Abrir Cliente 360 (`/operator/customers/:customerId`).
- Cambiar al directorio de pólizas.

## No debe inventar
- Crear cliente.
- Editar cliente.
- Eliminar cliente.
- Exportar.
- Selección masiva.
- Filtros no soportados por el API.
- Datos personales adicionales fuera del contrato.

## UX
- Sidebar navy oscuro coherente con R3.
- Densidad de tabla alta, sin saturación.
- Búsqueda y estado como controles principales.
- Resumen total compacto.
- La versión es dato técnico secundario, no protagonista.
- En móvil, cada fila se convierte en tarjeta compacta preservando nombre, referencia, estado, conteos y acceso al 360.
