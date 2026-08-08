# Purchasing Authority Phase 5 Audit

Date: 2026-08-08  
Branch: `fix/purchasing-authority-lifecycle`  
Baseline: `origin/integration/inventory-core-engine` (`2a5cee9`)  
Deployment: not performed

## Outcome

Phase 5 moves purchase-order creation, commercial calculation, approval decisions, issue, receipt accounting, cancellation and closure behind authenticated Firebase callable commands. Firestore rules now make purchase orders, procurement command records, PO approval decisions, and trusted PO audit/BI events server-owned.

## State machine

The implemented normal path is:

```text
DRAFT -> SUBMITTED -> PENDING_APPROVAL -> APPROVED -> ISSUED
      -> PARTIALLY_RECEIVED -> RECEIVED -> CLOSED
```

`REJECTED`, `CANCELLED`, and `FAILED` are exception states. Allowed transitions are declared in `functions/src/purchaseOrderLifecycle.ts`; every transition increments `version` and appends status history. Submission records its two transitions explicitly.

Cancellation is allowed only from `DRAFT`, `SUBMITTED`, `PENDING_APPROVAL`, `APPROVED`, `ISSUED`, and `PARTIALLY_RECEIVED`, always with a reason. A partial cancellation preserves received quantities and records closed outstanding quantity. Only `RECEIVED` can close.

## Trusted command boundary

`functions/src/purchaseOrderCommands.ts` exposes:

- `createPurchaseOrder`;
- `amendPurchaseOrder`;
- `submitPurchaseOrder`;
- `approvePurchaseOrder`;
- `rejectPurchaseOrder`;
- `cancelPurchaseOrder`;
- `issuePurchaseOrder`;
- `recordPurchaseOrderReceipt`;
- `closePurchaseOrder`.

Each command resolves Firebase UID, exact tenant membership ownership, active membership and role, current permission, and location scope inside its Firestore transaction. Supplier, warehouse, product, PO, policy, and approval records are loaded from the tenant partition. Browser actor/role/total/snapshot/approval values are not authority.

The client compatibility layer in `src/services/purchaseOrderCommands.ts` calls these commands. Existing purchase creation and general approval UI entry points route PO work to that layer. Issue, cancellation and closure actions are callable-backed.

## Warehouse-only destination

Creation rejects `BRANCH` and `TERMINAL`. The destination warehouse must be tenant-owned, active, licensed, and within the actor's assignment unless `location.all` applies. The supplier must be active and tenant-owned.

## Commercial calculation and snapshots

The server reads each canonical product and snapshots SKU and description. It validates positive finite quantity, non-negative finite unit cost, discount from 0–100, and tax from 0–100. It calculates rounded line subtotal, discount, tax and total, plus PO totals. Browser totals are never accepted.

Draft amendments require a current version. Submission freezes commercial mutation. Approval retains a complete approved commercial snapshot, so current product changes cannot alter historic PO evidence.

## Approval authority

Submission creates a versioned approval request containing the PO resource version. Approval/rejection requires both versions to remain current. Approval checks `purchase_order.approve`, active role, optional amount/currency/role thresholds, and segregation of duties. Self-approval is blocked by default. Rejection requires a reason.

Approval changes purchasing authority only; it invokes no inventory engine and changes no line quantity.

## Receiving integration

`applyPurchaseOrderReceipt` is the server domain integration used by `recordPurchaseOrderReceipt`. It accepts only `ISSUED` or `PARTIALLY_RECEIVED` POs, matches server supplier and warehouse, consumes current ordered/received/outstanding values, and rejects over-receipt unless a current approved `ALLOW_OVER_RECEIPT` record is resolved by the server.

Partial accounting produces `PARTIALLY_RECEIVED`; zero outstanding produces `RECEIVED`. The browser Firestore supplier receipt adapter no longer persists PO projections directly. The Phase 4 trusted receiving command should invoke the Phase 5 domain/command in its server transaction when the Phase 4 branch is integrated; no inventory posting logic was duplicated here.

## Idempotency and immutable events

Every command requires a stable command identity. A server-only command registry stores the first result. Exact replay returns that result before state/event writes; command reuse for another action is rejected.

Successful commands create deterministic immutable records in both `audit_events` and `bi_events`. Safe authenticated failures create `PURCHASE_ORDER_COMMAND_BLOCKED` or `PURCHASE_ORDER_COMMAND_FAILED`. Event payloads include tenant, vendor, supplier, warehouse, user, PO, command, outcome, reason, amount, currency, occurred time, and recorded time.

## Firestore security

Rules now deny browser create/update/delete on:

- `purchase_orders`;
- `purchase_order_commands`;
- `supplier_receipts` (preserving the trusted receiving boundary);
- purchase-order approval request decisions;
- trusted `audit_events` and `bi_events`.

Authorized location-scoped PO reads remain available. Received orders cannot be deleted. Existing inventory balances and movements remain server-owned.

## Test evidence

Functions tests cover:

- unauthenticated, non-member, wrong-tenant and missing-permission rejection;
- branch/terminal, inactive and unlicensed destination rejection;
- invalid suppliers/products;
- server totals and invalid numbers;
- draft-only amendments;
- explicit submission and invalid transitions;
- command replay and identity conflict;
- unauthorized, threshold, self and stale approval rejection;
- approval with no inventory effect;
- rejection history and issued immutability;
- partial/final/over receiving;
- state-dependent cancellation and controlled closure.

Firestore emulator tests cover direct PO/command mutation, received PO deletion, PO approval mutation, and trusted event fabrication. The inventory write audit remains the regression guard for prohibited inventory writers.

Validation results:

- `scripts/validate-sot.ps1`: passed, 26 required documents;
- root `npm run lint`: passed;
- root `npm test`: passed, 145 tests;
- root `npm run build`: passed (existing bundle-size warnings only);
- Functions `npm ci`: completed using the lockfile;
- Functions `npm test`: passed, 29 tests;
- Functions `npm run build`: passed;
- Firestore emulator rules: passed, 11 tests;
- `scripts/audit-inventory-writes.ps1`: 30 classified findings, 0 prohibited writers;
- `git diff --check`: passed.

## Migration and rollback

Existing legacy `OPEN` and `COMPLETED` records are read as `ISSUED` and `RECEIVED` by the client normalizer. New writes use canonical states only. No destructive migration is run.

Rollback is code/rules rollback to the prior release candidate. Command and event history is append-only and must not be deleted during rollback. POs created under Phase 5 retain their canonical data and can be read by rollback tooling even if lifecycle actions are paused.

## Deferred work

- Callable emulator integration coverage remains required before the acceptance matrix can move from Partial to Verified.
- Phase 4 and Phase 5 server handlers must be integrated in the release-candidate branch so receipt inventory posting and PO balance mutation share one Firestore transaction.
- Multi-stage approval and a formal post-issue revision entity are deferred; controlled cancellation/reissue is the MVP amendment path.
- Notification delivery and reporting projections consume the canonical events in later bounded phases.
