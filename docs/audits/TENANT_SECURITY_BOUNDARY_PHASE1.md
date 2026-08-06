# Tenant Security Boundary — Phase 1 Evidence

Date: 2026-08-06

Branch: `fix/tenant-security-boundary`

## Applied SOT

- `docs/sot/MVP_SCOPE.md`
- `docs/sot/DOMAIN_INVARIANTS.md`
- `docs/sot/ARCHITECTURE_BOUNDARIES.md`
- `docs/sot/ROLE_AND_PERMISSION_MATRIX.md`
- `docs/sot/domains/TENANCY_AND_ONBOARDING.md`
- `docs/sot/domains/ORGANISATION_STRUCTURE.md`
- `docs/sot/domains/INVENTORY_LEDGER.md`
- `docs/sot/domains/BI_EVENT_LOGGING.md`
- `docs/sot/EVENT_AND_AUDIT_STANDARD.md`

## Existing path map

Operational data is stored under `vendors/{vendorId}`. Current client code uses:

- organisation: `warehouses`, `branches`, `terminals`;
- identity/profile: `staff`, `settings/roles`;
- catalogue and supply: `products`, `suppliers`, `purchase_orders`, `supplier_receipts`;
- inventory: `warehouse_inventory`, `branch_inventory`, `inventory_movements`, `transfers`, `adjustments`;
- operations: `approval_requests`, `approval_events`, `orders`, `shifts`;
- intelligence: `bi_logs`;
- billing and other vendor modules under their existing vendor subtree.

No canonical membership collection existed. `staff` records were not keyed by Firebase UID, contained menu grants rather than action permissions, and supported only one optional branch assignment. They were therefore unsuitable as tenant authority. Phase 1 adds the SOT-required path `vendors/{vendorId}/memberships/{firebaseUid}` and leaves `staff` as profile/operational data.

## Direct client operational writers identified

`src/services/db.ts` directly writes vendor resources, products, warehouse and branch balances, purchase orders, suppliers, transfers, adjustments, orders, staff, approvals, audit events, BI events and shifts. Canonical sale and supplier-receipt adapters also currently execute Firestore inventory writes from the browser. `src/bi/tracker.ts` writes `bi_logs` directly.

Phase 1 blocks all ordinary client writes to:

- `warehouse_inventory`;
- `branch_inventory`;
- `inventory_balances` and `inventory_balance`;
- `inventory_movements`.

This intentionally blocks legacy browser-side inventory posting. Future phases must move these commands behind trusted Admin SDK services; the rules must not be weakened to restore them.

## Rule authority

An active membership must match the vendor path, tenant, Firebase UID and required structural fields. Action permissions and warehouse, branch and terminal assignment arrays are evaluated at request time. Missing, incomplete, suspended, cross-tenant or location-mismatched membership data fails closed.

Inventory movements are readable only within assigned stock locations and are never client-writable. BI and audit events require tenant identity, explicit event permissions and applicable location scope for creation, and cannot be updated or deleted.

## Emulator evidence

`tests/firestore.rules.test.ts` verifies unauthenticated rejection, cross-vendor read/write denial, branch and warehouse assignment boundaries, direct balance-write denial, movement immutability, BI immutability, allowed reads, missing/incomplete membership rejection, and forged tenant/location rejection.

Result: 9 passed, 0 failed using Firestore Emulator `v1.19.8`.

## Migration and rollback

Existing vendors require canonical membership documents before the new rules are deployed. Deploying rules without that migration will correctly fail closed. Rollback should restore the prior rules file only in a controlled non-production environment; the former authenticated-global-access rule is not an acceptable production rollback.
