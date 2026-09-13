# Staff Workspace R3 — análisis de racionalización

Estado: **EN REVISIÓN VISUAL**  
Decisión preliminar: **MANTENER / SIMPLIFICAR**

## Problema que resuelve

Ofrecer una entrada común y consciente del rol para las capacidades R3 sin elevar permisos ni convertir a Platform Admin en superusuario operativo.

## Hallazgo principal

`OperatorShell` ya dispone de navegación filtrada por permisos. Por tanto, Staff Workspace no debe duplicar todo el sidebar en una cuadrícula extensa ni funcionar como otro dashboard.

## Rol real de la vista

Staff Workspace debe actuar como **launchpad de orientación por rol**:

- Operador: acceso conciso a trabajo operativo productizado.
- Supervisor: trabajo operativo + Analytics cuando corresponda.
- Platform Admin: entrada segura a Analytics y administración de plataforma sin Claims/Tasks implícitos.

## Principios

- La autorización real permanece en API.
- Solo mostrar capacidades realmente productizadas para el rol.
- No representar una API sin UI completa como una acción disponible.
- No presentar permisos internos como protagonista visual.
- No repetir todos los enlaces del sidebar si no aportan contexto adicional.
- Platform Admin no hereda Claims Operations.

## Agrupación visual recomendada

### Operación
- Tablero / Claims Operations
- Clientes y pólizas
- Renovaciones
- Cobranzas

### Supervisión
- Analytics

### Plataforma
- Pipelines
- Plantillas de comunicación
- Custom Fields
- Guidance
- Automations
- Importaciones gobernadas
- Recovery Operations

La UI renderiza únicamente los grupos/capacidades que el rol puede utilizar.

## Scope excluido

- Comunicaciones operativas como flujo final mientras persista el gap contractual de selección de plantilla activa.
- Bulk Actions como vista independiente.
- Tarjetas `UI planificada` dentro del launchpad final.
- Conteos de permisos como KPI principal.
- Cualquier noción de superusuario.

## Resultado esperado

Una pantalla compacta de bienvenida/orientación, especialmente útil para Platform Admin y como ruta neutral `/operator/workspace`, sin competir con el Dashboard de Operaciones ni duplicar la navegación persistente.
