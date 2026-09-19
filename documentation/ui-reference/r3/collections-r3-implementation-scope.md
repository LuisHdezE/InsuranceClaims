# Collections R3 — Implementation Scope

Estado: CANDIDATE / DRAFT
Base checkpoint: `main @ a9964bbc218dcd6c26ca5843f3c4af0db9c26e3d`

## Referencia canónica

- `documentation/ui-reference/r3/collections-approved.md`
- `documentation/ui-reference/r3/collections-approved.svg`

## Contrato revisado

- `GET /api/v1/operator/collections`
- `GET /api/v1/operator/collections/:collectionId`
- `POST /api/v1/operator/collections/:collectionId/transitions`
- `POST /api/v1/operator/collections/:collectionId/operational-transitions`
- `PATCH /api/v1/operator/collections/:collectionId/payment-state`
- permisos `collections.read` y `collections.manage`

## Alcance de esta lane

- pulido visual compacto de bandeja y detalle de Cobranzas R3;
- interfaz visible en español;
- lifecycle presentado como `Ciclo de vida`;
- estado de pago, ciclo de vida y pipeline operativo permanecen como tres autoridades separadas;
- Customer 360 y Policy 360 continúan enlazados por permisos, sin duplicar sus vistas;
- transformación de tabla a cards en tablet/móvil para evitar scroll horizontal interno;
- Cobranzas pasa a `ready` únicamente en esta rama candidata, sin modificar permisos;
- gate permanente `Collections R3 Viewport` más guard exacto de 1024 px;
- reconciliación del QA del sidebar con la madurez visual nueva.

## Fuera de alcance

- backend, auth, RBAC, endpoints u OpenAPI;
- crear o eliminar casos de cobranza;
- inventar importes, facturas, recibos, vencimientos, métricas o datos financieros;
- inventar filtros no publicados por el contrato;
- inventar nombres visibles para etapas siguientes cuando la API solo publica keys;
- ampliar o modificar los estados permitidos de lifecycle/pipeline;
- exponer selector o entrada manual de `paymentState` mientras la API no publique la allowlist;
- convertir `paymentState` en lifecycle o etapa operativa.

## Reglas funcionales preservadas

- `paymentState` es valor autoritativo del servidor;
- el endpoint PATCH existente no justifica una UI de edición sin catálogo publicado;
- lifecycle y pipeline continúan usando `expectedVersion`;
- conflictos 409 conservan refetch del servidor;
- los IDs/versiones técnicas no deben dominar la experiencia del operador.

## QA visual

El gate debe recorrer Login → Cobranzas → detalle real con stub determinista y validar:

- 1366x768;
- 1280x720;
- 1024x768;
- 390x844;
- ausencia de overflow horizontal de página;
- tabla compacta en desktop;
- cards sin scroll interno a <=1100 px;
- composición responsive del detalle;
- separación visible entre Ciclo de vida, Estado de pago y Pipeline operativo;
- targets móviles de 44 px en acciones interactivas;
- ausencia de errores severos de consola;
- capturas viewport y full-page.

## Gobernanza

Mantener PR en Draft hasta que el gate visual esté verde y Luis otorgue aprobación visual explícita. La aprobación visual no autoriza merge; el merge requiere autorización explícita separada.
