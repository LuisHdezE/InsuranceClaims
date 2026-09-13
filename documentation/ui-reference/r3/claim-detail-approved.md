# Claim Detail — Referencia visual aprobada R3

Estado: APROBADA
Fecha de aprobación: 2026-09-12
Capability: Claim Detail / Claim Operations
Decisión de alcance: CORE

## Objetivo funcional

Permitir al operador comprender el siniestro en profundidad y actuar sobre él sin mezclar conceptos de negocio que deben permanecer separados.

## Composición visual aprobada

- Interfaz visible en español.
- Diseño compacto, profesional y de alta densidad informativa.
- Cabecera con identidad del siniestro, estado, etapa operacional y acciones principales.
- Bloque resumen con vehículo, póliza, cliente y tipo/lugar del evento.
- Navegación secundaria por Resumen, Tareas, Evidencia, Historial, Comunicaciones y Auditoría.
- Columna principal con descripción, datos del siniestro, tercero involucrado y notas internas.
- Bloque central con Flujo del siniestro, Etapa operacional y Actividad reciente.
- Columna lateral con Tareas relacionadas, Evidencia y accesos rápidos.
- Auditoría técnica permanece secundaria/colapsable y no domina la interfaz.

## Principios de dominio que la UI debe respetar

- Claim Lifecycle y Operational Pipeline son conceptos distintos y no deben fusionarse en un único “Estado”.
- Las transiciones de ClaimStatus deben seguir usando las garantías del servidor, aunque los detalles técnicos no se expongan visualmente.
- No mostrar al operador claves técnicas de etapa como mecanismo final de UX.
- No inventar un selector de etapas futuras si la API no expone todavía las transiciones permitidas antes del movimiento.
- Tareas, evidencia y actividad son capacidades relacionadas pero no deben cambiar implícitamente el ClaimStatus.
- Timeline operacional y Audit Log técnico deben conservarse como conceptos separados.

## Referencia gráfica

Archivo canónico: `claim-detail-approved.jpg`

Esta referencia fue aprobada explícitamente por Luis y debe utilizarse como baseline visual al ajustar la implementación real de Claim Detail. Cualquier desviación material debe revisarse antes de implementarse.