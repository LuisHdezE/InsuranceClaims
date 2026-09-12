# Cliente 360 — Referencia visual aprobada R3

Estado: APROBADA
Fecha de aprobación: 2026-09-12
Capability: Customer 360
Decisión de alcance: MANTENER / SIMPLIFICAR

## Objetivo funcional

Dar al operador contexto inmediato del cliente y permitir navegar a sus pólizas y siniestros relacionados sin duplicar las funciones de Claim Detail.

## Baseline visual aprobado

- Interfaz visible en español.
- Diseño compacto, atractivo y de alta densidad informativa.
- Cabecera con identidad del cliente, referencia, estado y resumen cuantitativo.
- Pólizas relacionadas como tarjetas compactas con referencia, estado, assets e identificación de aseguradora cuando exista.
- Siniestros relacionados como lista operativa compacta con tracking, póliza, vehículo, estado y fecha.
- Accesos a Policy 360 y Claim Detail sujetos a permisos reales del operador.
- Sin formularios de edición ni acciones autoritativas que el contrato R3 no exponga.

## Límite contractual obligatorio

La referencia gráfica aprobada marca la dirección visual, no amplía el contrato del producto. La implementación real de Customer 360 solo debe presentar los datos que devuelve actualmente el backend R3: nombre de presentación, customerRef, estado, versión, fecha de actualización y relaciones con pólizas y Claims.

No deben convertirse en requisitos implícitos los elementos ilustrativos no soportados por el contrato actual, por ejemplo datos financieros, documentos, canales de contacto, notas, tareas o creación/edición de recursos desde Customer 360.

## Referencia gráfica

Archivo vectorial canónico: `customer-360-approved.svg`

La vista debe mantener el ADN visual común R3: tipografía contenida, paddings moderados, jerarquía clara y máximo aprovechamiento del viewport.