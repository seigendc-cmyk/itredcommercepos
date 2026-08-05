# Domain Invariants

These rules must remain true regardless of screen design, storage technology or implementation approach.

## Tenancy

- Every operational record belongs to exactly one vendor tenant.
- Tenant authority must never be granted from a client-provided vendorId alone.
- Cross-vendor reads and writes are prohibited.
- Warehouse, branch and terminal relationships must remain inside one tenant.
- Privileged support access must be explicit and audited.

## Location hierarchy

- Every vendor has at least one warehouse and one branch.
- Every default branch has one default terminal.
- A terminal belongs to a branch, never directly to a warehouse.
- Warehouses cannot operate carts or complete customer sales.
- Supplier stock can only be received into a warehouse.
- Branches receive supplier-originated stock through warehouse-to-branch transfers.

## Purchasing

- Purchase orders do not create inventory.
- Purchase-order approval does not create inventory.
- Supplier receiving creates supplier-originated stock.
- Cancelled or closed purchase orders cannot receive additional stock.
- Partial receipts preserve outstanding quantities.

## Inventory

- Current stock must reconcile to an append-only stock ledger.
- Posted movements cannot be silently edited or deleted.
- Corrections use reversal or adjustment entries.
- Every movement identifies tenant, location, product, quantity, source, actor and time.
- Transfers use separate dispatch and receiving stages.
- Negative stock is prohibited unless an approved policy explicitly permits it.

## Stocktake

- A count does not directly modify stock.
- Approved adjustment posting modifies stock.
- Original counts, recounts and approvals remain traceable.
- Counters cannot approve their own material variance when segregation of duties is enabled.

## Sales

- A sale belongs to one vendor, branch, terminal and shift.
- Checkout requires an active authorized terminal and an open shift.
- Sales use branch inventory, never warehouse inventory.
- Sale totals must be calculated by trusted domain logic.
- Sale posting and stock deduction must be atomic.
- Every sale requires a unique idempotency key.
- Posted sales cannot be directly edited.

## Approvals

- UI visibility is not authorization.
- Approval rules must execute in the service layer or trusted backend.
- Duplicate and stale approval decisions must be rejected.
- Approval decisions record actor, role, reason, timestamp and expected version.
- Rejected or cancelled requests create no stock or financial effect.

## BI and audit

- Meaningful business actions generate append-only events.
- Mouse movement, hovering and meaningless interface activity are not BI events.
- BI events must remain tenant-isolated.
- Historical events cannot be directly edited.
- Risk indicators must be explainable through contributing events.

## Reporting

- Reports derive from authoritative transactions, ledgers and events.
- Reports must not mutate operational records.
- Reports declare timezone, currency, date basis and filters.
- Financial and stock totals must reconcile with their source records.
