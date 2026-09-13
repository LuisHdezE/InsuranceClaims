# Customer Journey público R3 — candidate contract-exact

## Decisión
**CORE / MANTENER Y SIMPLIFICAR**.

La experiencia pública del MVP no es un portal de seguros completo. Su responsabilidad real es permitir dos journeys verificables: **reportar un siniestro** y **consultar su estado**.

## Rutas públicas reales
- `/` — landing pública.
- `/claims/new/verify` — Paso 1: verificar póliza + vehículo.
- `/claims/new` — Paso 2: capturar datos + evidencia opcional.
- `/claims/new/review` — Paso 3: revisar y confirmar.
- `/claims/new/success` — Paso 4: confirmación de creación.
- `/claims/track` — consulta pública mediante prueba conjunta.
- `/claims/track/status` — proyección pública del estado.

## Journey A — Reportar siniestro
### Paso 1 · Verificar
Input:
- `policyReference`: requerido, máximo 80 caracteres.
- `vehicleReference`: requerido, máximo 80 caracteres.

La UI no consulta directamente ningún legacy. `verifyPolicyVehicle` / API es la única autoridad de elegibilidad.

### Paso 2 · Datos del evento
Input:
- `eventType`: texto libre, máximo 60 caracteres; la UI no inventa catálogo.
- `occurredAt`: fecha y hora requeridas.
- `locationText`: requerido, máximo 300 caracteres.
- `description`: requerida, máximo 4000 caracteres.
- evidencia opcional.

Evidencia admitida:
- JPEG.
- PNG.
- PDF.
- máximo 5 archivos.
- máximo 5 MiB por archivo.
- cliente y servidor validan; el servidor conserva autoridad final.

### Paso 3 · Revisión
La pantalla resume exactamente:
- póliza.
- vehículo.
- tipo de evento.
- fecha/hora.
- ubicación.
- descripción.
- evidencia.

La acción `Confirmar y enviar` ejecuta la única creación autoritativa.

La intención usa una `Idempotency-Key` creada una sola vez y reutilizada únicamente para reintentar exactamente el mismo contenido. Cambiar verificación o draft reinicia esa intención.

### Paso 4 · Confirmación
La respuesta pública puede mostrar:
- `trackingCode`.
- estado inicial `RECEIVED`.
- `submittedAt`.
- `nextSteps` publicados por el API.
- `requestId` técnico si existe.
- aviso de replay idempotente si corresponde.

Acciones reales:
- `Dar seguimiento`.
- `Volver al inicio` y resetear flujo.

## Journey B — Seguimiento
La consulta exige dos datos que forman una única prueba:
- `trackingCode`.
- `policyReference`.

Ambos son requeridos y admiten hasta 80 caracteres en la UI.

Una combinación inválida debe tratarse como `no encontrado`; la UI no revela cuál dato falló.

## Proyección pública de estado
Estados publicados:
- `RECEIVED` → Recibido.
- `UNDER_REVIEW` → En revisión.
- `OBSERVED` → Observado.
- `APPROVED` → Aprobado.
- `IN_REPAIR` → En reparación.
- `CLOSED` → Cerrado.

La vista pública puede mostrar únicamente:
- `trackingCode`.
- estado actual.
- `summary.vehicleReference`.
- `summary.eventType`.
- `summary.occurredAt`.
- `timeline` público con estado + fecha/hora.
- `nextSteps` públicos.
- `requestId` técnico si existe.

Acciones:
- `Actualizar estado` usando la misma prueba activa.
- `Nueva consulta`, que limpia el tracking flow.

No expone auditoría, IDs internos de Claim, tareas, pipeline, documentos internos, operadores, notas ni datos de backoffice.

## Landing canónica
La landing debe tener apariencia comercial y clara, pero solo dos CTAs funcionales principales:
- `Reportar un siniestro`.
- `Dar seguimiento`.

El header puede incluir `Acceso equipo` hacia `/operator/login`. No debe llamarse `Área de clientes`, porque R3 no publica un portal autenticado de clientes.

Contenido conceptual fuera de alcance como cotización, pagos web, FAQ o biblioteca documental puede conservarse únicamente como contenido editorial claramente no interactivo, pero no debe competir con las dos capacidades reales ni parecer productizado. La referencia canónica opta por simplificar y retirarlo del área de acción principal.

## UX canónica
- Sin sidebar de backoffice.
- Header público claro y ligero.
- Navegación centrada en Inicio, Reportar, Seguimiento y Acceso equipo.
- Progreso de reporte siempre visible: `Verificar → Datos del siniestro → Revisar → Confirmación`.
- No pedir de nuevo datos que ya estén en `ClaimFlowContext`.
- Mostrar la póliza/vehículo verificados como contexto de lectura en Paso 2.
- Mantener errores de API y validación accesibles.
- Confirmación de éxito debe priorizar el `trackingCode` y los próximos pasos.
- Seguimiento debe diferenciar visualmente consulta y resultado.
- Responsive conserva todos los campos y estados esenciales.
- Mantener aviso visible de caso técnico no oficial y uso exclusivo de datos sintéticos.

## No debe inventar
- Portal o cuenta autenticada para clientes.
- Cotización real de seguros.
- Pagos web funcionales.
- Gestión de pólizas del cliente.
- Edición/cancelación de Claims públicos.
- Chat en vivo.
- MFA / login de cliente.
- Catálogo cerrado de `eventType`.
- Exposición de auditoría, pipeline, tareas o notas internas.
- Descarga de evidencia interna.
- Indicar cuál parte de la prueba de tracking fue incorrecta.

## Fuente de verdad
En cualquier diferencia entre una referencia visual y el producto real, prevalecen las rutas, tipos y componentes R3 implementados en `App.tsx`, `VerifyPolicyPage.tsx`, `NewClaimPage.tsx`, `ReviewClaimPage.tsx`, `ClaimSubmittedPage.tsx`, `TrackClaimPage.tsx`, `ClaimStatusPage.tsx`, `ClaimFlowLayout.tsx`, `ClaimFlowContext.tsx`, `evidence.ts` y `api/types.ts`.
