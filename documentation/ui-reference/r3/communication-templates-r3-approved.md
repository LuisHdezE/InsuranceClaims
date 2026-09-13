# Communication Templates R3 — candidate contract-exact

## Decisión
**DIFERENCIADOR TÉCNICO / MANTENER**.

Communication Templates administra definiciones y contenido versionado para EMAIL y WHATSAPP. No es un catálogo de envío para operadores y no mezcla `communications.admin` con `communications.send`.

## Contrato real
- Permiso de administración: `communications.admin`.
- Canales: `EMAIL`, `WHATSAPP`.
- Estados de versión: `DRAFT`, `ACTIVE`, `RETIRED`.
- Tipos de variable: `STRING`, `NUMBER`, `BOOLEAN`.
- El listado publicado soporta solo `page` y `pageSize`; no inventar búsqueda ni filtros.
- Page size actual: `25`.

## Directorio
Cada definición muestra únicamente:
- `key`.
- `channel`.
- `enabled`.
- `definitionId` como dato técnico secundario.
- `version` de definición.
- cantidad de versiones.
- versión activa si existe.
- versión más reciente y su estado.

Acciones:
- Nueva plantilla.
- Actualizar/refetch.
- Paginación anterior/siguiente.
- Administrar definición.

## Creación
Crear una plantilla produce:
1. definición deshabilitada;
2. primera versión `DRAFT`.

Campos:
- `key` estable y única.
- `channel` EMAIL o WHATSAPP.
- `subject`: obligatorio en EMAIL; no aplica a WHATSAPP.
- `body`: obligatorio, máximo 8000 caracteres.
- `variableSchema`: variables tipadas STRING / NUMBER / BOOLEAN.
- `sourceClassification`: opaca; la UI no añade semántica de negocio.

## Detalle y versionado
- El contenido histórico es inmutable.
- Crear nueva versión genera siempre `DRAFT` y se protege con `expectedDefinitionVersion`.
- Nueva versión se prellena desde la activa o, si no existe, desde la más reciente.
- Solo una versión `DRAFT` puede activarse.
- Activar DRAFT usa `expectedDefinitionVersion`.
- Habilitar/deshabilitar definición usa `expectedDefinitionVersion`.
- Deshabilitar puede retirar la versión activa.
- No se puede habilitar una definición sin una versión activa válida.
- Ante `409`, refrescar la proyección autoritativa; no reintentar a ciegas.

## UX canónica
- Sidebar navy oscuro coherente con R3.
- Directorio compacto, sin métricas inventadas.
- Canal y enabled son badges de lectura rápida.
- La key es la identidad visual principal; IDs y versiones técnicas son secundarios.
- En detalle, el historial de versiones es protagonista.
- DRAFT debe distinguirse claramente y ser la única versión con acción `Activar DRAFT`.
- ACTIVE y RETIRED son históricos inmutables, sin edición inline.
- En móvil, las mismas definiciones/versiones pasan a tarjetas compactas; no se elimina información contractual.

## No debe inventar
- Búsqueda o filtros del directorio no publicados por R3.
- Editar una versión existente.
- Borrar definiciones o versiones.
- Enviar mensajes desde este módulo.
- Vista previa de entrega real, métricas de apertura, tasa de envío o test-send.
- Canales distintos de EMAIL/WHATSAPP.
- Tipos de variable distintos de STRING/NUMBER/BOOLEAN.
