# Cobranzas — Referencia visual aprobada R3

Estado: APROBADA POR CONTINUIDAD
Fecha: 2026-09-12
Capability: Collections Operations
Decisión de alcance: MANTENER / SIMPLIFICAR

## Objetivo funcional

Gestionar casos de cobranza sin confundir tres conceptos distintos: lifecycle del caso, estado de pago autoritativo y pipeline operativo.

## Composición visual aprobada

- Interfaz visible en español.
- Diseño compacto, profesional y consistente con el resto del backoffice R3.
- Bandeja de casos con cliente, póliza, lifecycle, estado de pago y etapa operativa.
- Detalle de caso con contexto 360, lifecycle y pipeline claramente separados.
- Acceso a Cliente 360 y Póliza 360 sin duplicar toda su información.
- Responsive móvil basado en cards compactas y navegación inferior.

## Restricciones contractuales

- No inventar métricas financieras, importes, recibos, facturas, fechas de vencimiento o semánticas de pago que la API R3 no exponga.
- El estado de pago es un valor autoritativo del servidor.
- La API valida los valores de paymentState contra una allowlist configurada, pero actualmente no publica ese catálogo.
- Hasta que exista contrato para consultar los estados permitidos, la UI final no debe presentar un selector ficticio ni exigir al operador conocer códigos técnicos.
- Lifecycle y pipeline operativo permanecen separados.
- Las mutaciones continúan respetando expectedVersion y conflictos 409 aunque esos detalles técnicos no dominen la UI.

## Referencia gráfica

La imagen aprobada en conversación define la dirección visual del módulo. La implementación final debe conservar su composición y densidad, eliminando cualquier elemento ilustrativo que no esté respaldado por el contrato R3.
