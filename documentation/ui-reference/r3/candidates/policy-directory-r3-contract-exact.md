# Directorio de Pólizas R3 — candidate contract-exact

## Decisión
**MANTENER / SIMPLIFICAR**.

El Directorio de Pólizas es una bandeja de búsqueda y selección. No duplica Póliza 360 y no introduce edición ni acciones de negocio inexistentes.

## Contrato real
- Endpoint: `GET /api/v1/operator/policies`.
- Permiso de presentación: `policies.read`.
- Filtros soportados: `search`, `status`, `page`, `pageSize`.
- Estados: `ACTIVE`, `INACTIVE`.
- Page size actual de la UI: `25`.

## Campos visibles por fila
- `policyReference`.
- `legacyPolicyReference`.
- Cliente relacionado: `displayName` + `customerRef` cuando existe.
- `recordStatus`.
- Conteo de `assets`.
- `claimCount`.
- `version`.

## Acciones permitidas
- Buscar.
- Filtrar por estado.
- Restablecer filtros.
- Actualizar/refetch.
- Paginación anterior/siguiente.
- Abrir Póliza 360 (`/operator/policies/:policyId`).
- Cambiar al Directorio de Clientes.

## No debe inventar
- Crear póliza.
- Editar póliza.
- Eliminar póliza.
- Exportar.
- Selección masiva.
- Filtros no soportados por el API.
- Datos de cobertura, primas o fechas que no estén expuestos por esta proyección.

## UX
- Sidebar navy oscuro coherente con R3.
- Densidad alta de tabla sin saturación.
- La referencia moderna es primaria; la referencia legacy es secundaria.
- El cliente relacionado aparece como contexto, no como edición.
- Assets y Claims son conteos compactos.
- La versión es dato técnico secundario.
- En móvil, cada fila se convierte en tarjeta compacta preservando referencia moderna/legacy, cliente, estado, conteos y acceso al 360.
