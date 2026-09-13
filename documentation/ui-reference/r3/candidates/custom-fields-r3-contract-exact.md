# Custom Fields R3 — candidate contract-exact

## Decisión
**DIFERENCIADOR TÉCNICO / MANTENER**.

Custom Fields administra definiciones versionadas para proyecciones R3 sin permitir que la UI reemplace identidad, lifecycle, seguridad ni campos protegidos del dominio.

## Contrato real
- Permiso de administración: `custom_fields.admin`.
- Targets: `CLAIM`, `RENEWAL`, `COLLECTION`.
- Tipos: `STRING`, `NUMBER`, `BOOLEAN`, `DATE`, `ENUM`.
- Sensibilidad: `PUBLIC_SAFE`, `STAFF_ONLY`.
- Estados de versión: `DRAFT`, `ACTIVE`, `RETIRED`.
- El listado soporta únicamente `page` y `pageSize`; no inventar búsqueda ni filtros.
- Page size actual: `25`.

## Identidad de definición
- `fieldKey` estable, 1–80 caracteres, patrón R3.
- `targetType` forma parte de la identidad y no cambia en versiones posteriores.
- El API es autoridad sobre claves protegidas; la UI no replica ni revela la lista interna.

## Contenido versionado
Cada versión define:
- `valueType`.
- `displayName` hasta 160 caracteres.
- `validationMetadata` tipada.
- `enumValues` cuando `valueType = ENUM`.
- `sensitivityClassification`.
- `sourceClassification` opaca.

### Límites publicados por la UI
- `validationMetadata`: máximo 20 entradas.
- Claves de metadata: patrón estable R3 y sin duplicados.
- Valores STRING de metadata: 1–500 caracteres.
- NUMBER debe ser finito.
- BOOLEAN: `true` o `false`.
- ENUM: entre 1 y 100 valores únicos, máximo 160 caracteres cada uno.

## Lifecycle
- Crear definición produce una definición deshabilitada + primera versión `DRAFT`.
- El contenido histórico es inmutable.
- Crear nueva versión genera siempre `DRAFT`.
- Solo `DRAFT` puede activarse.
- Activación y enable/disable usan `expectedDefinitionVersion`.
- Deshabilitar una definición activa puede retirar su versión activa.
- No se puede habilitar sin una versión activa válida.
- Ante `409`, refetch autoritativo y nunca reintento ciego.

## Directorio
Cada tarjeta muestra únicamente:
- `fieldKey`.
- `targetType`.
- `enabled`.
- `version` de definición.
- cantidad de versiones.
- versión activa, si existe.
- tipo de valor de la versión más reciente.

Acciones:
- Nuevo Custom Field.
- Actualizar/refetch.
- Paginación anterior/siguiente.
- Administrar definición.

## UX canónica
- Sidebar navy oscuro coherente con R3.
- Directorio compacto, sin filtros inventados.
- Target y enabled como badges de lectura rápida.
- `fieldKey` como identidad principal; IDs y versiones técnicas son secundarios.
- En detalle, el historial de versiones es protagonista.
- DRAFT es la única versión accionable con `Activar DRAFT`.
- ACTIVE y RETIRED son históricos inmutables, sin edición inline.
- Mostrar sensibilidad y tipo claramente, sin exponer claves protegidas internas.
- En móvil se preserva la misma información contractual en tarjetas compactas.

## No debe inventar
- Búsqueda o filtros de directorio no publicados.
- Editar una versión existente.
- Borrar definiciones o versiones.
- Cambiar `fieldKey` o `targetType` después de crear la definición.
- Tipos distintos de STRING/NUMBER/BOOLEAN/DATE/ENUM.
- Sensibilidades distintas de PUBLIC_SAFE/STAFF_ONLY.
- Una lista visible de claves reservadas del dominio.
- Semántica adicional para `sourceClassification` o `validationMetadata` que el contrato no declara.
