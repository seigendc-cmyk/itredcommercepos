# Inventory Release-Candidate Integration Gate

Date: 2026-08-08  
Branch: `rc/inventory-purchasing-receiving`

## Outcome

Phase 4 supplier receiving/reversal and Phase 5 purchase-order accounting are integrated behind authenticated callable commands. The authoritative posting path uses one Firestore transaction for approval consumption, disposition-aware canonical inventory balances, immutable movements, the supplier receipt, purchase-order received/outstanding quantities, command replay state, and audit/BI events.

The browser no longer posts approved supplier inventory through its legacy Firestore adapter. Approval review invokes `postSupplierReceipt`; Firestore rules continue to deny client receipt, balance, movement, purchase-order command, audit-event and BI-event writes.

## Canonical behavior

- `delivered = accepted + damaged + quarantined + rejected` is mandatory.
- Accepted enters `ON_HAND`; damaged enters `DAMAGED`; quarantined enters `QUARANTINED`; rejected remains receipt history only.
- All delivered quantity accounts against the linked issued purchase order.
- Repeated partial receipts remain `PARTIALLY_RECEIVED`; completion becomes `RECEIVED`.
- Over-receipt requires an approved, tenant-bound exception which is consumed in the transaction.
- Reversal adds `SUPPLIER_RECEIPT_REVERSAL` movements linked to immutable originals and recalculates PO received/outstanding state.
- Command documents and deterministic movement/event identities provide replay safety.

## Gate evidence

- Functions TypeScript build: `npm --prefix functions run build`
- Root TypeScript validation: `npm run typecheck`
- Production build: `npm run build`
- Rules emulator: `npm run test:rules`
- Callable integration gate: `npm run test:integration:receiving`
- Callable cases: 35 (minimum required: 24), using real Auth, Functions, and Firestore emulators.

The callable suite covers authentication, membership/tenant/permission/location authority, supplier/product/approval validity, all four dispositions, partial/final/over PO accounting, exception consumption, replay and identity collision, concurrent outstanding-quantity contention, three injected posting rollback points, reversal accounting/immutability/replay/insufficient-stock/rollback, audit/BI parity, and browser write denial.

## Release boundary

No deployment or merge to `main` was performed. Production deployment remains an explicitly authorized release action.
