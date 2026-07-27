# iTred Commerce POS MVP Scope

Status: Approved implementation boundary
Version: 1.0
Owner: iTred Commerce Product
Last updated: 27 July 2026

## Included

- Firebase Authentication for vendor identity.
- Separate POS staff identity, status, role, branch assignment and menu access.
- Vendor onboarding and minimum licensed warehouse, branch and branch terminal.
- Branch-terminal POS sales with current branch stock.
- Atomic online orders, payments, stock deductions and inventory movements.
- Idempotent checkout attempts and immutable transaction snapshots.
- Product, warehouse and branch inventory management.
- Supplier receipts, transfers, adjustments and stocktakes through existing controlled services.
- Approval workflows and segregation of duties.
- Licensed warehouse, branch and terminal allowances.
- Billing and delivery capabilities already implemented by existing services.
- Meaningful vendor-scoped BI and audit records.
- Controlled offline checkout only under the approved amendment and deployment flags.
- Responsive, accessible UI governed by `UI_UX_DESIGN_SYSTEM.md`.

## Conditional

A conditional capability may be exposed only when its service, permission, entitlement, configuration and approved SOT exist:

- controlled offline checkout;
- synchronization submission and server acknowledgement;
- delivery management;
- paid resource add-ons;
- country tax or fiscal authority integrations;
- hardware integrations;
- exports or printing not already supported.

Missing capabilities must not be represented with mock data or simulated success.

## Excluded or not authorised

- Warehouse sales or warehouse POS terminals.
- Uncontrolled offline checkout.
- UI-only stock deductions, permission checks or approval decisions.
- Cross-vendor data access.
- Plain-text staff access codes.
- Silent editing or deletion of completed transactions.
- Automatic certification of customs classifications.
- Unsupported payment-gateway simulation.
- Legal or fiscal compliance claims without official validation.
- Server synchronization acceptance where no approved service exists on the active branch.

## Completion criteria

A capability is complete only when its service and data controls exist, permission and entitlement checks survive direct access, live tenant-scoped data is used, required audit/BI events are recorded, failure behaviour is explicit, and applicable tests, lint and build pass.
