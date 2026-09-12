# Administración de Pipelines — Referencia visual aprobada R3

Estado: APROBADA
Fecha de aprobación: 2026-09-12
Capability: Platform Admin / Pipelines
Decisión de alcance: MANTENER

## Objetivo funcional

Permitir administrar definiciones de pipeline, versiones inmutables y transiciones gobernadas para los consumidores R3 soportados.

## Alcance contractual real

- Consumidores permitidos: `CLAIM`, `RENEWAL`, `COLLECTION`.
- Cada definición puede habilitarse o deshabilitarse.
- Las versiones existentes son inmutables.
- Una nueva versión nace como `DRAFT`.
- La activación de una versión es explícita y separada del enable de la definición.
- Las etapas tienen `stageKey`, nombre visible, orden, `allowedNextStageKeys` y `reportingFlags` booleanos.
- La UI conserva control de concurrencia y refresca ante conflicto 409.
- R3 admite de 1 a 50 etapas por versión.

## Composición visual aprobada

- Interfaz en español, compacta y orientada a administración técnica.
- Directorio de pipelines con nombre, consumidor, estado, versión activa y cantidad de etapas.
- Detalle del pipeline con mapa ordenado de etapas y transiciones permitidas.
- Historial/versionado visible sin convertir UUIDs o claves internas en el foco principal.
- Acciones claras para crear versión, activar DRAFT y habilitar/deshabilitar definición.
- Detalles técnicos avanzados accesibles, pero secundarios.

## Correcciones obligatorias respecto de la referencia gráfica

La referencia visual aprobada contiene elementos ilustrativos que NO forman parte del contrato actual y deben eliminarse al implementar:

- No existe consumidor `RECLAMACIONES`; usar únicamente `CLAIM`, `RENEWAL`, `COLLECTION`.
- No inventar métricas, filtros ni tipos de etapa que el API no publique.
- No presentar edición mutable de una versión activa; las versiones son inmutables.

## Referencia gráfica

Archivo vectorial canónico: `pipelines-admin-approved.svg`.

La implementación debe conservar el ADN visual aprobado: español, densidad alta, jerarquía clara, títulos contenidos, paddings moderados y máximo aprovechamiento del viewport.