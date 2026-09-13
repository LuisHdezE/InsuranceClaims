# InsuranceClaims R3 — Referencias visuales canónicas

Este directorio conserva las vistas **aprobadas explícitamente** durante la racionalización visual de InsuranceClaims R3.

## Reglas visuales obligatorias

- Interfaz visible al usuario en **español**.
- Diseño atractivo, profesional y orientado a operaciones.
- Alta densidad útil de información sin saturación.
- No desperdiciar viewport con títulos sobredimensionados, paddings ornamentales o márgenes excesivos.
- Cabeceras, KPIs, filtros, tablas y tarjetas deben ser compactos.
- Cada bloque debe justificar el espacio que ocupa.
- Mantener jerarquía visual clara y accesibilidad.
- No inventar capacidades que el producto o la API no soporten.
- No simular drag & drop en Claims Workspace.
- Claim Lifecycle y Operational Pipeline siguen siendo conceptos distintos.
- Los detalles técnicos de concurrencia, versiones, IDs o claves internas no deben dominar la UI normal del operador.
- Cuando una referencia gráfica incluya datos ilustrativos no soportados por el contrato, prevalece siempre la ficha `.md` de esa capability.

## Flujo de aprobación

1. Se define la responsabilidad funcional de la vista.
2. Se contrasta contra el contrato/implementación R3 real.
3. Se genera una referencia visual.
4. Luis la revisa y aprueba o solicita ajustes.
5. Solo las vistas aprobadas se guardan aquí como baseline canónico.
6. La implementación posterior debe compararse contra estas referencias sin violar las capacidades reales del sistema.

## Vistas aprobadas

| Vista | Alcance | Referencia |
|---|---|---|
| Tablero de Operaciones | CORE | `operations-dashboard-approved.svg` |
| Claims Workspace / Kanban | CORE | `claims-workspace-kanban-approved.jpg` |
| Claims Workspace responsive | CORE | `claims-workspace-responsive-approved.md` |
| Claim Detail / Claim Operations | CORE | `claim-detail-approved.jpg` + `claim-detail-approved.md` |
| Tareas operativas | CORE | `tasks-operational-approved.svg` + `tasks-operational-approved.md` |
| Cliente 360 | MANTENER / SIMPLIFICAR | `customer-360-approved.svg` + `customer-360-approved.md` |
| Póliza 360 | MANTENER / SIMPLIFICAR | `policy-360-approved.svg` + `policy-360-approved.md` |
| Renovaciones | MANTENER / SIMPLIFICAR | `renewals-approved.svg` + `renewals-approved.md` |
| Cobranzas | MANTENER / SIMPLIFICAR | `collections-approved.svg` + `collections-approved.md` |
| Administración de Pipelines | DIFERENCIADOR TÉCNICO / MANTENER | `pipelines-admin-approved.svg` + `pipelines-admin-approved.md` |
| Automatizaciones R3 | DIFERENCIADOR TÉCNICO / MANTENER | `automations-admin-approved.svg` + `automations-admin-approved.md` |
| Importaciones Gobernadas R3 | DIFERENCIADOR TÉCNICO / MANTENER | `governed-imports-dryrun-commit-approved.svg` + `governed-imports-dryrun-commit-approved.md` |
| Recovery Operations / Dead Letters | DIFERENCIADOR TÉCNICO / MANTENER | `recovery-operations-approved.svg` + `recovery-operations-approved.md` |
| Analytics R3 | MANTENER / SIMPLIFICAR | `analytics-r3-approved.svg` + `analytics-r3-approved.md` |
| Staff Workspace R3 | MANTENER / SIMPLIFICAR | `staff-workspace-r3-approved.svg` + `staff-workspace-r3-approved.md` |

## Principios funcionales clave

### Tablero de Operaciones
Responsabilidad: **priorizar**. Responde a: **¿qué requiere atención?**

### Claims Workspace
Responsabilidad: **encontrar y seleccionar**. No edita Claims y no simula drag & drop.

### Claim Detail
Responsabilidad: **comprender y actuar**. Claim Lifecycle y Operational Pipeline permanecen separados. Timeline operacional y Audit Log técnico también.

### Tareas
Responsabilidad: **organizar y cerrar trabajo operativo**. Completar una tarea no cambia automáticamente ClaimStatus.

### Cliente 360 / Póliza 360
Responsabilidad: **contexto rápido de lectura**. No se inventa edición ni atributos ausentes en el API.

### Renovaciones / Cobranzas
Responsabilidad: **gestionar casos de negocio propios** sin duplicar los 360. Lifecycle y pipeline permanecen separados. En Cobranzas, el estado de pago es una tercera dimensión autoritativa independiente.

### Administración de Pipelines
Responsabilidad: **gobernar configuración versionada** para `CLAIM`, `RENEWAL` y `COLLECTION`. Las versiones son inmutables; DRAFT, activación y enable/disable son pasos explícitos y gobernados.

### Automatizaciones R3
Responsabilidad: **gobernar reglas operacionales versionadas** usando el modelo CUANDO → SI → ESPERA → ENTONCES, sin convertir métricas o acciones ilustrativas de mockups en capacidades reales.

### Importaciones Gobernadas R3
Responsabilidad: **migrar datos sintéticos de referencia bajo un workflow controlado**: Subida → Preview → Mapping → Validación → Dry-run → Commit. El commit es una mutación de riesgo explícita y el conflicto 409 exige refetch autoritativo.

### Recovery Operations / Dead Letters
Responsabilidad: **diagnosticar Integration Events y recuperar trabajos dead-letter de forma gobernada**. Requeue y Resolve usan versión esperada; no existe reintento ciego ante 409.

### Analytics R3
Responsabilidad: **supervisar métricas operacionales agregadas**. `reportedInWindow` representa Claims creados en `[from,to)`; los demás conteos son snapshots al `generatedAt` y no se reinterpretan como totales de la ventana.

### Staff Workspace R3
Responsabilidad: **orientar por rol hacia capacidades realmente autorizadas y productizadas**. No es un segundo dashboard ni un duplicado del sidebar; `PLATFORM_ADMIN` no hereda operación de negocio como superusuario implícito.
