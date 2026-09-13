# Póliza 360 — Referencia visual aprobada R3

Estado: APROBADA
Fecha de aprobación: 2026-09-12
Capability: Policy 360
Decisión de alcance: MANTENER / SIMPLIFICAR

## Objetivo funcional

Dar al operador una vista contextual y principalmente de lectura de la póliza, sus relaciones y los recursos que la API R3 devuelve de forma autoritativa.

## Composición visual aprobada

- Interfaz visible en español.
- Diseño compacto, profesional y coherente con el resto del baseline R3.
- Cabecera con referencia de póliza, estado y contexto mínimo.
- Cliente relacionado visible cuando el contrato lo devuelve y el rol posee permiso de lectura.
- Assets cubiertos presentados de forma compacta.
- Claims relacionados con navegación hacia Claim Detail cuando RBAC lo permite.
- Metadata operacional visible sin reinterpretar ni inventar significado.
- Adaptación responsive coherente con la navegación móvil aprobada.

## Restricción contractual obligatoria

La imagen visual aprobada es una guía de composición, jerarquía y estilo. La implementación real NO debe incorporar campos ilustrativos que no existan en el contrato R3 vigente.

En particular, no deben asumirse ni inventarse:

- prima anual;
- fechas de vigencia;
- ramo o producto;
- moneda;
- forma de pago;
- coberturas comerciales;
- documentos;
- edición de póliza;
- acciones de reporte/comunicación que no estén respaldadas por operaciones autoritativas existentes.

La vista debe construirse únicamente con `policyReference`, `legacyPolicyReference`, `recordStatus`, `version`, `insurerReference`, `customer`, `assets`, `claims` y `operationalMetadata`, además de las relaciones/navegaciones realmente permitidas por RBAC.

## Principios de UX

- Policy 360 es contexto operativo, no un segundo Claim Detail.
- Mantener alta densidad informativa sin desperdicio de viewport.
- No exponer nombres técnicos cuando pueda mostrarse una etiqueta humana sin perder fidelidad contractual.
- Metadata opaca debe mostrarse como dato transportado, no reinterpretarse como lógica de negocio.
- La vista permanece read-only mientras no exista operación autoritativa de edición.

## Referencia gráfica

Referencia vectorial canónica: `policy-360-approved.svg`.

La composición gráfica aprobada puede contener elementos ilustrativos; esta ficha contractual prevalece sobre cualquier dato no soportado por la API.
