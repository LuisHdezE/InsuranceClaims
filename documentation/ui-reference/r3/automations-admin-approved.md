# Automatizaciones R3 — Referencia visual aprobada

Estado: APROBADA
Fecha de aprobación: 2026-09-12
Capability: Automation Admin
Decisión de alcance: DIFERENCIADOR TÉCNICO / MANTENER

## Objetivo funcional

Permitir a administración definir y gobernar automatizaciones versionadas sin convertir la UI en una consola técnica críptica. La lectura primaria debe ser operacional y comprensible mediante el modelo **CUANDO → SI → ESPERA → ENTONCES**.

## Composición visual aprobada

- Interfaz visible en español.
- Diseño compacto, atractivo y de alta densidad útil.
- Directorio de automatizaciones con identidad, estado, versión activa e información contractual disponible.
- Detalle organizado conceptualmente como CUANDO → SI → ESPERA → ENTONCES.
- Estado habilitada/deshabilitada claramente separado de la activación de una versión.
- Historial de versiones visible y comprensible.
- Acceso a creación de nueva definición y nueva versión.
- Mobile responsive con tarjetas compactas y sin perder la estructura de regla.
- UUIDs, keys, JSON y detalles de concurrencia pueden existir en vistas técnicas, pero no deben dominar la experiencia normal.

## Contrato R3 que debe respetarse

Triggers publicados:
- `CLAIM_CREATED`
- `CLAIM_STATE_TRANSITIONED`
- `CLAIM_TASK_COMPLETED`
- `COMMUNICATION_DELIVERED`
- `INBOUND_EVENT_PROCESSED`
- `SCHEDULED_CHECK`

Actions publicadas:
- `CREATE_TASK`
- `MOVE_OPERATIONAL_STAGE`
- `REQUEST_COMMUNICATION`
- `ADD_OPERATIONAL_TAG`
- `NOTIFY_OPERATOR`
- `PAUSE_AUTOMATION`
- `UPDATE_APPROVED_FIELD`
- `SCHEDULE_CHECK`

Operadores de condición:
- `EQ`
- `NEQ`
- `IN`
- `NOT_IN`
- `EXISTS`
- `NOT_EXISTS`

Límites y seguridad:
- Máximo 20 condiciones por versión.
- Entre 1 y 20 acciones por versión.
- Máximo 20 parámetros por acción.
- `wait.delaySeconds` entre 60 segundos y 30 días.
- Los parámetros de acción son escalares.
- La UI no debe introducir URL/URI, SQL, script, code, secret, token o password en parámetros.
- Crear definición genera primera versión `DRAFT` y la definición nace deshabilitada.
- Activar versión y habilitar definición son pasos separados.
- Las versiones activadas/retiradas se tratan como historia inmutable.
- Las mutaciones usan `expectedDefinitionVersion`; ante `409` se refresca la proyección autoritativa y no se reintenta a ciegas.

## Directorio y alcance publicado

El listado autoritativo R3 publica paginación. La UI no debe inventar filtros por trigger, tipo de acción, key o estado si el contrato vigente no los expone.

## Elementos ilustrativos que NO son requisito

Métricas de ejecución, porcentajes de éxito/error, historial operacional, exportación, pruebas ad hoc o filtros que aparezcan en una referencia visual no se convierten en capacidades reales si el contrato R3 no los publica.

## Regla visual

La información técnica debe permanecer disponible, pero la lectura primaria debe ser humana: disparador, condiciones, espera y acciones. La referencia visual orienta composición, densidad, jerarquía y estilo; el contrato real prevalece sobre cualquier elemento ilustrativo.