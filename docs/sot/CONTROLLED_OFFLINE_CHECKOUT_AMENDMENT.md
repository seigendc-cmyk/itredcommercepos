# SOT Amendment — Controlled Offline POS Checkout

Status: **APPROVED FOR IMPLEMENTATION**
Effective date: **26 July 2026**

This amendment supersedes the unconditional prohibition on completed offline sales only for transactions satisfying every control below.

## Approved boundary

Controlled offline checkout may complete customer sales using an enrolled branch terminal, authenticated encryption, one atomic SQLite transaction, immutable identifiers, branch-scoped stock, approved offline payments, durable BI/audit records and an encrypted synchronization outbox.

It does not approve server synchronization acceptance, authoritative reconciliation, offline supplier receipts, offline warehouse transfers, offline licence expansion or unrestricted administrative activity.

## Mandatory controls

- The device, tenant, vendor, branch and terminal relationship must be enrolled online and active.
- The branch and terminal must be licensed; cached configuration and entitlement must remain valid.
- The cashier offline authorization must be active and unexpired.
- The terminal must have an open shift for that cashier.
- `stockLocationId` must equal the selling branch. Warehouse or another branch’s stock is forbidden.
- Current branch-scoped price and tax records must provide immutable sale-item snapshots.
- Only `CASH` with `LOCAL_CASH` or approved local credit with `PREAUTHORISED` verification is accepted.
- Payment totals must equal the calculated sale total.
- Sale header, items, payments, stock deductions, movements, receipt, fiscal status, audit, BI, outbox and queue records must commit in one SQLite transaction.
- Completed sales use `COMPLETED_PENDING_SYNC`; fiscalisation remains a separate `PENDING` state.
- Completed records are immutable. Refunds, reversals and adjustments require correction transactions.
- Retrying an idempotency key returns the existing sale and never deducts stock twice.

## Encryption and device keys

SQLite bytes and backups must be encrypted with authenticated encryption before persistence. Operational keys are wrapped by a non-extractable device-bound key, versioned, and recoverable only for the enrolled browser/device context. Missing, revoked, expired or invalid key state fails closed.

## Synchronization boundary

The branch may create and inspect durable encrypted outbox records. This amendment does not authorize code to accept, reconcile or mark a sale `SYNCED` on behalf of the authoritative server.
