# Guidance R3 — candidate contract-exact

## Decisión
**DIFERENCIADOR TÉCNICO / MANTENER**.

Guidance gobierna orientación configurada y versionada. La UI presenta el contenido publicado, pero no asigna semántica de negocio adicional a contexto, categorías, metadata o clasificación de origen.

## Contrato real
- Permiso de administración: `guidance.admin`.
- Estados de versión: `DRAFT`, `ACTIVE`, `RETIRED`.
- El listado publicado soporta solo `page` y `pageSize`; no inventar búsqueda ni filtros.
- Page size actual: `25`.
- La definición contiene `key`, `enabled`, `activeVersionId`, `version` y versiones.

## Contenido de versión
Cada versión publica:
- `insurerContextReference`.
- `guidanceCategory`.
- `documentCategories`.
- `instructions`.
- `assistanceMetadata`.
- `sourceClassification`.

Estos campos son configuración opaca. R3 no publica un catálogo cerrado ni reglas adicionales que la UI deba inferir.

## Creación
- `key`: identidad estable, máximo 80 caracteres y patrón R3.
- La definición nace deshabilitada.
- La primera versión nace `DRAFT`.
- Activar y habilitar son pasos posteriores e independientes.

## Límites publicados por la UI R3
- `insurerContextReference`: obligatorio, máximo 80 caracteres.
- `guidanceCategory`: obligatoria, máximo 80 caracteres.
- `sourceClassification`: obligatoria, máximo 80 caracteres.
- `documentCategories`: máximo 20 elementos, cada uno entre 1 y 80 caracteres.
- `instructions`: máximo 20 elementos, cada uno entre 1 y 1000 caracteres.
- `assistanceMetadata`: máximo 20 pares clave/valor.
- Claves de metadata: únicas y con patrón estable R3.
- Valores de metadata: entre 1 y 500 caracteres.

## Gobernanza
- El contenido histórico es inmutable.
- Crear nueva versión genera siempre `DRAFT`.
- Solo una versión `DRAFT` puede activarse.
- Activación y enable/disable usan `expectedDefinitionVersion`.
- Deshabilitar una definición activa puede retirar su versión activa.
- No se habilita una definición sin versión activa válida.
- Ante `409`, refrescar la proyección autoritativa; no reintentar a ciegas.

## Directorio
Cada definición muestra de forma compacta:
- `key`.
- `enabled`.
- versión activa si existe.
- `version` de definición.
- cantidad de versiones.
- última `guidanceCategory`.
- último `insurerContextReference`.

Acciones:
- Nueva Guidance.
- Actualizar/refetch.
- Paginación anterior/siguiente.
- Administrar definición.

## UX canónica
- Sidebar navy oscuro consistente con R3.
- Directorio compacto sin filtros inventados.
- `key` como identidad principal; datos técnicos secundarios.
- Historial de versiones como protagonista del detalle.
- DRAFT claramente distinguido y con acción `Activar DRAFT`.
- ACTIVE y RETIRED se muestran como históricos inmutables.
- Contexto, categoría, documentos, instrucciones, metadata y source classification se muestran sin inferir significado adicional.
- En móvil se conserva la misma información contractual en tarjetas compactas.

## No debe inventar
- Búsqueda o filtros no publicados por R3.
- Edición inline de versiones históricas.
- Eliminación de definiciones o versiones.
- Catálogos cerrados de categorías/contextos que R3 no publique.
- Reglas automáticas derivadas de `assistanceMetadata`.
- Decisiones operacionales automáticas a partir de Guidance.
