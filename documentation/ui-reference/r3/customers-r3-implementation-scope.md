# Customers R3 — implementation scope

## Canonical references
- `customer-directory-approved.svg`
- `customer-directory-approved.md`
- `customer-360-approved.svg`
- `customer-360-approved.md`

## Productized routes
- `/operator/customers`
- `/operator/customers/:customerId`

## Authoritative contract
- `GET /api/v1/operator/customers`
- `GET /api/v1/operator/customers/:customerId`
- presentation permission: `customers.read`

## Deliberate non-changes
This increment is presentation-only. It does not change backend contracts, authentication, RBAC, persistence or business rules.

It does not invent customer creation, editing, deletion, export, bulk selection, unsupported filters, personal contact data, financial data, documents, notes or tasks.

Customer 360 remains a read-only context and navigation surface. Policy 360 and Claim Detail links remain permission-aware through the existing role grants.

## Visual QA
The permanent Customers R3 viewport gate exercises real SPA login and navigation through Customer Directory into Customer 360 at:
- 1366×768
- 1280×720
- 1024×768
- 390×844

It verifies no page-level horizontal overflow, desktop directory density, mobile row-to-card transformation, desktop/touch responsive behavior, Customer 360 relation layout, mobile touch targets and severe browser console errors. It also stores viewport and full-page screenshots for both routes.
