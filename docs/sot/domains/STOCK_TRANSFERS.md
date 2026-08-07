# Stock Transfers

## Authority and route

Transfer inventory is changed only by authenticated Firebase callable commands. The backend resolves tenant membership, permissions, and assigned locations. Warehouse-to-branch transfers require an active licensed warehouse source and active branch destination in the same tenant. Branch-to-branch transfers use the same staged dispatch and destination receipt workflow.

## Lifecycle

`DRAFT -> SUBMITTED -> PENDING_APPROVAL -> APPROVED -> DISPATCHING -> DISPATCHED -> IN_TRANSIT -> RECEIVING -> RECEIVED -> COMPLETED`

Exceptions are `REJECTED`, `CANCELLED`, `DISPUTED`, `FAILED`, and `REVERSED`. Durable records may advance through transient states in one atomic command, but emitted events preserve the transition evidence.

## Accounting

- Dispatch atomically reduces source available stock and posts `TRANSFER_DISPATCH`.
- Dispatch establishes explicit per-line in-transit quantity.
- Receipt posts `TRANSFER_RECEIPT`, consumes only outstanding in-transit stock, and increases destination stock by accepted quantity.
- Each line stores approved, dispatched, received, outstanding, disputed, and reversed quantities.
- Distinct partial receipts use distinct stable command keys; replay of one key is a no-op.
- Shortage, damage, loss, and quantity disagreement remain recorded as discrepancies. They are never clamped.
- Reversal posts `TRANSFER_REVERSAL` compensating movements. Posted movements are never edited or deleted.

## Reconciliation

The read-only reconciliation command verifies for each line:

`dispatched = outstanding in transit + branch received + disputed + reversed`

It reports divergence and never repairs or mutates it.

## Trusted events

Transfer commands append audit and BI events for dispatch, in-transit, partial receipt, completion, discrepancy, dispute, and reversal. Submission and approval events remain part of the approval workflow.
