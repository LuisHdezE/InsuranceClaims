# Automatizaciones R3 — referencia visual aprobada

Estado: **APROBADA**

## Decisión de producto

Mantener como capacidad técnica diferencial del R3. La interfaz debe traducir la automatización a un lenguaje operacional comprensible sin ocultar la gobernanza del backend.

## Responsabilidad

Administrar definiciones versionadas de automatización y comprender su flujo lógico como **CUANDO → SI → ESPERA → ENTONCES**.

## Capacidades reales que debe respetar la UI

- Definiciones versionadas e inmutables.
- Estados habilitada/deshabilitada.
- Versión activa explícita.
- Nueva versión DRAFT y activación separada.
- 6 triggers aprobados por R3.
- Operadores de condición `EQ`, `NEQ`, `IN`, `NOT_IN`, `EXISTS`, `NOT_EXISTS`.
- Espera opcional entre 60 segundos y 30 días.
- Entre 1 y 20 acciones por versión.
- 8 tipos de acción aprobados: `CREATE_TASK`, `MOVE_OPERATIONAL_STAGE`, `REQUEST_COMMUNICATION`, `ADD_OPERATIONAL_TAG`, `NOTIFY_OPERATOR`, `PAUSE_AUTOMATION`, `UPDATE_APPROVED_FIELD`, `SCHEDULE_CHECK`.
- Parámetros escalares gobernados por guardrails de seguridad.
- Concurrencia optimista mediante `expectedDefinitionVersion`.

## Reglas visuales

- Toda la UI visible al usuario debe estar en español.
- Diseño compacto y de alta densidad útil.
- Evitar títulos gigantes, padding ornamental y márgenes innecesarios.
- Presentar el flujo CUANDO/SI/ESPERA/ENTONCES con jerarquía visual clara.
- UUIDs, keys, JSON y detalles de concurrencia pueden existir en vistas técnicas, pero no deben dominar la experiencia normal.
- No inventar métricas de ejecución, filtros o analítica si el contrato R3 no los expone.
- El listado autoritativo actual publica paginación, no filtros por trigger, tipo de acción, key o estado.

## Nota sobre la referencia visual

La referencia aprobada orienta composición, densidad, jerarquía y estilo. Elementos ilustrativos que no estén respaldados por el contrato vigente, como métricas de ejecución, exportación o pruebas ad hoc, no se convierten en requisitos funcionales.
