# R3 Web Productization - Increment 03

## Purpose

Productize the existing R3 Customer & Policy 360 read model without changing the frozen API contract, widening role grants, or fabricating customer/policy data that the runtime does not expose.

## Baseline

- repository: `LuisHdezE/InsuranceClaims`
- Blueprint consumer baseline: `0.5.2`
- frozen implementation base: `065b78ff28b10ca24e96baa98a14385c5a5128bf` (merge of PR #61)
- delivery mode: GREENFIELD
- legacy coexistence: SIMULATED only
- API v1 R3: frozen for this increment

## Authoritative API surface

The increment consumes the existing operator endpoints:

- `GET /api/v1/operator/customers` (`listCustomers`)
- `GET /api/v1/operator/customers/:customerId` (`getCustomer`)
- `GET /api/v1/operator/policies` (`listPolicies`)
- `GET /api/v1/operator/policies/:policyId` (`getPolicy`)

List operations use the runtime-supported `page`, `pageSize`, `search`, and `status` parameters. `status` is constrained to `ACTIVE | INACTIVE`.

## Access model

Presentation gating mirrors the already-established R3 grants:

- `CLAIMS_OPERATOR`: `customers.read`, `policies.read`
- `CLAIMS_SUPERVISOR`: `customers.read`, `policies.read`
- `PLATFORM_ADMIN`: neither permission

The API remains the authorization authority. Platform Admin is not treated as an implicit Customer/Policy superuser.

New protected deep links:

- `/operator/customers`
- `/operator/customers/:customerId`
- `/operator/policies`
- `/operator/policies/:policyId`

## Product surfaces

### Customer Directory

- server-side search;
- ACTIVE/INACTIVE filter;
- server pagination;
- customer reference, display name, state, version;
- policy and Claim counts from the R3 projection;
- navigation to Customer Detail.

### Customer Detail

- customer identity projection and version;
- related policies with modern and legacy references;
- policy asset counts and insurer reference when present;
- related Claims from the backend projection;
- links into Policy 360 and Claims only when the current role has the corresponding presentation permission.

### Policy Directory

- server-side search;
- ACTIVE/INACTIVE filter;
- server pagination;
- modern and legacy policy references;
- related customer summary;
- asset and Claim counts;
- navigation to Policy Detail.

### Policy Detail

- policy references, state, version and insurer reference;
- related customer summary;
- policy assets with modern/legacy references;
- operational and asset metadata displayed as opaque R3 fields without reinterpretation;
- related Claims from the backend projection.

## Truthfulness constraints

The current Customer/Policy read model does not expose contact details, physical addresses, premium amounts, coverage limits, payment data, policy dates, or editable CRM fields. The web MUST NOT invent or infer those values.

The API exposes no Customer/Policy mutation endpoints in the frozen R3 surface, therefore Increment 03 is intentionally read-only. No fake Edit/Save buttons are introduced.

## Visual direction

The 360 surfaces extend the existing Insurance Operations visual language:

- light operational workspace;
- deep navy hierarchy;
- cyan/blue accents;
- compact state chips;
- relationship cards rather than decorative fake metrics;
- mobile table transformation into labeled rows;
- responsive detail heroes and asset grids.

## Test coverage

New client tests verify:

- Customer list query parameters and bearer authorization;
- Customer detail resource path;
- Policy list query parameters;
- Policy detail resource path;
- request-id propagation on Customer list.

Staff access tests are extended to prove authorized Customer/Policy deep links and rejection for Platform Admin.

## Historical evidence boundary

This increment updates only the living R3 productization inventory. The historical 10-interface MVP evidence is not rewritten. Historical VFR/Release Gate sentinels may therefore remain red after legitimate post-review product changes and must not be bypassed by mutating old evidence.

## Human gate

A PR for this increment must not be merged without explicit human approval for that PR and its current exact head SHA.
