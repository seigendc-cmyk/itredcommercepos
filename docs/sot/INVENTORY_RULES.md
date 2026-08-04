# MVP Sale Inventory Rules

- Sale completion must use current Firestore branch inventory, not a UI cache.
- The active terminal must exist, be active, and belong to the sale branch.
- Missing or insufficient branch inventory must reject the entire sale.
- Stock balances must never be clamped to zero to conceal an insufficient balance.
- The order, every stock deduction, and every sale inventory movement must commit in one Firestore transaction.
- Each deducted product must create a movement containing its before quantity, negative delta, after quantity, branch, terminal, and order.
- A checkout attempt ID must identify the order so retries cannot commit duplicate deductions.
- Failed online transactions must return an explicit failure and must not create a local completed sale.
- Server synchronization acceptance and authoritative reconciliation remain outside the current implementation scope.
- Uncontrolled offline checkout is prohibited.
- Controlled offline checkout is approved under `CONTROLLED_OFFLINE_CHECKOUT_AMENDMENT.md` only when the enrolled-device, encryption, tenant, branch, terminal, shift, cashier, price, tax, stock, payment, atomicity, fiscal-status, BI and durable-outbox controls all pass.
- A controlled completed offline sale must use `COMPLETED_PENDING_SYNC`; it must never be represented as synchronized without a future authoritative server acknowledgement.
- Inventory movement input references an existing active canonical Product ID. Opening balance, receiving, transfer, adjustment and stocktake approval services reject missing, archived or unresolved duplicate identities and never create a Product from a movement row.
- Idempotency keys protect approval creation and final inventory posting. Retried approvals must return or retain the existing request and approved adjustments post once.
- Completed online sales post through the canonical Inventory Posting Engine using one transaction-scoped repository over the existing Firestore collections. Every product produces one positive-magnitude `SALE` movement; source direction is represented by the branch location.
- The authenticated Firebase UID is currently both the tenant partition key and vendor document ID. Sale callers must still pass `tenantId` and `vendorId` as separate explicit fields, and the compatibility boundary rejects disagreement until a distinct tenant-to-vendor mapping is introduced.
- Canonical sale movements retain legacy report values in a typed `compatibility` projection: `branchId`, `terminalId`, `orderId`, `productName`, lowercase `movementType`, signed `quantityDelta`, `quantityBefore`, `quantityAfter` and `createdAt`.
