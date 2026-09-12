# Renovaciones — Referencia visual aprobada R3

Estado: APROBADA POR CONTINUIDAD DE REVISIÓN
Fecha: 2026-09-12
Capability: Policy Lifecycle / Renewals
Decisión de alcance: MANTENER + SIMPLIFICAR

## Objetivo funcional

Gestionar casos de renovación sin duplicar Customer 360 ni Policy 360. La vista debe concentrarse en el caso de renovación, su lifecycle y su pipeline operativo.

## Alcance real

- Listado paginado de casos de renovación.
- Cliente relacionado.
- Póliza relacionada.
- Lifecycle del caso: `OPEN`, `COMPLETED`, `CANCELLED`.
- Pipeline operativo separado del lifecycle.
- Transiciones terminales gobernadas por servidor.
- Próximas etapas permitidas publicadas por el pipeline.
- Control de versión y refetch ante 409.

## Reglas de diseño

- Español visible al usuario.
- No convertir Renovaciones en otro 360.
- No inventar filtros, primas, ofertas, cotizaciones ni métricas no publicadas por el contrato.
- No exponer claves técnicas como experiencia principal cuando exista nombre visible.
- Mantener acceso directo a Cliente 360 y Póliza 360.

## Referencia gráfica

Archivo vectorial: `renewals-approved.svg`.

La composición visual aprobada prioriza una bandeja compacta y un detalle del caso con lifecycle + pipeline claramente separados.