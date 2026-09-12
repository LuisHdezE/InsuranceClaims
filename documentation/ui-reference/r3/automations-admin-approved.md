# Automatizaciones R3 — Referencia visual aprobada

Estado: APROBADA
Fecha de aprobación: 2026-09-12
Capability: Automation Admin
Decisión de alcance: MANTENER / DIFERENCIADOR TÉCNICO

## Objetivo funcional

Permitir a administración definir y gobernar automatizaciones versionadas sin convertir la UI en una consola técnica críptica.

## Composición visual aprobada

- Interfaz visible en español.
- Diseño compacto, atractivo y de alta densidad informativa.
- Directorio de automatizaciones con nombre, key, estado, trigger principal, versión activa y cantidad de acciones.
- Detalle de la automatización organizado conceptualmente como CUANDO → SI → ESPERA → ENTONCES.
- Estado habilitada/deshabilitada claramente separado de la activación de una versión.
- Historial de versiones visible y comprensible.
- Acceso a creación de nueva definición y nueva versión.
- Mobile responsive con tarjetas compactas y sin perder la estructura de regla.

## Contrato R3 que debe respetarse

Triggers aprobados:
- CLAIM_CREATED
- CLAIM_STATE_TRANSITIONED
- CLAIM_TASK_COMPLETED
- COMMUNICATION_DELIVERED
- INBOUND_EVENT_PROCESSED
- SCHEDULED_CHECK

Actions aprobadas:
- CREATE_TASK
- MOVE_OPERATIONAL_STAGE
- REQUEST_COMMUNICATION
- ADD_OPERATIONAL_TAG
- NOTIFY_OPERATOR
- PAUSE_AUTOMATION
- UPDATE_APPROVED_FIELD
- SCHEDULE_CHECK

Operadores de condición:
- EQ
- NEQ
- IN
- NOT_IN
- EXISTS
- NOT_EXISTS

Límites y seguridad:
- Máximo 20 condiciones por versión.
- Entre 1 y 20 acciones por versión.
- Máximo 20 parámetros por acción.
- wait.delaySeconds entre 60 segundos y 30 días.
- Los parámetros de acción son escalares.
- La UI no debe introducir URL/URI, SQL, script, code, secret, token o password en parámetros.
- Crear definición genera primera versión DRAFT y la definición nace deshabilitada.
- Activar versión y habilitar definición son pasos separados.
- Las versiones activadas/retiradas se tratan como historia inmutable.
- Las mutaciones usan concurrencia optimista y ante 409 se refresca la proyección autoritativa.

## Elementos ilustrativos que NO son requisito

La referencia aprobada puede mostrar métricas de ejecución, éxito/error, filtros o historial operacional como recursos visuales. No deben implementarse como funcionalidad real si el contrato R3 no los expone todavía.

## Regla visual

La información técnica debe permanecer disponible, pero la lectura primaria debe ser humana: disparador, condiciones, espera y acciones. UUIDs, JSON y detalles de concurrencia no deben dominar la experiencia normal.
