# Custom Fields R3 — approved contract-exact

## Decisión
**DIFERENCIADOR TÉCNICO / MANTENER**.

Custom Fields administra definiciones y contenido versionado para extensiones operacionales controladas en `CLAIM`, `RENEWAL` y `COLLECTION`. No es un constructor libre ni puede reemplazar identidad, estado, seguridad o campos reservados del dominio.

## Contrato real
- Permiso de administración: `custom_fields.admin`.
- Targets: `CLAIM`, `RENEWAL`, `COLLECTION`.
- Tipos de valor: `STRING`, `NUMBER`, `BOOLEAN`, `DATE`, `ENUM`.
- Sensibilidad: `PUBLIC_SAFE`, `STAFF_ONLY`.
- Estados de versión: `DRAFT`, `ACTIVE`, `RETIRED`.
- El listado publicado soporta solo `page` y `pageSize`; no inventar búsqueda ni filtros.
- Page size actual: `25`.

## Identidad estable
- `fieldKey` y `targetType` forman identidad de definición y no se modifican en versiones posteriores.
- La definición nace deshabilitada con su primera versión `DRAFT`.
- El API mantiene autoridad sobre claves protegidas y límites de dominio.

## Contenido versionado
Cada versión contiene:
- `valueType`.
- `displayName`.
- `validationMetadata`.
- `enumValues` cuando `valueType = ENUM`.
- `sensitivityClassification`.
- `sourceClassification`.

## Validación
- `validationMetadata`: máximo 20 entradas.
- Claves de metadata con patrón estable R3.
- Valores de metadata tipados como STRING, NUMBER o BOOLEAN.
- `ENUM`: entre 1 y 100 valores únicos; máximo 160 caracteres por valor.
- `displayName`: obligatorio, máximo 160 caracteres.
- `sourceClassification`: obligatorio, máximo 80 caracteres y semánticamente opaco para la UI.

## Gobernanza
- El contenido histórico es inmutable.
- Crear nueva versión genera siempre `DRAFT`.
- Solo `DRAFT` puede activarse.
- Activación y enable/disable usan `expectedDefinitionVersion`.
- Deshabilitar una definición activa puede retirar su versión activa.
- Ante `409`, refrescar la proyección autoritativa y no reintentar a ciegas.

## UX canónica
- Sidebar navy oscuro coherente con R3.
- Directorio compacto con target, enabled, fieldKey, versión de definición, número de versiones, versión activa y último tipo.
- Historial de versiones como centro del detalle.
- DRAFT claramente diferenciado y con la única acción `Activar DRAFT`.
- ACTIVE y RETIRED son históricos inmutables y no se editan inline.
- La UI no publica ni replica la lista interna de claves protegidas.
- En móvil, se preserva la misma información contractual en tarjetas compactas.

## No debe inventar
- Búsqueda o filtros del directorio no publicados por R3.
- Edición de una versión existente.
- Eliminación de definiciones o versiones.
- Targets distintos de CLAIM/RENEWAL/COLLECTION.
- Tipos distintos de STRING/NUMBER/BOOLEAN/DATE/ENUM.
- Sensibilidades distintas de PUBLIC_SAFE/STAFF_ONLY.
- Capacidad para sobrescribir campos reservados o claves protegidas.
