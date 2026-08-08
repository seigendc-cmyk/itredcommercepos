# Supplier Receiving

## 1. Purpose

Supplier receiving records delivered goods and creates supplier-originated warehouse inventory.

## 2. Destination rule

Supplier stock must be received into a warehouse.

The following flow is mandatory:

```text
Supplier â†’ Warehouse â†’ Branch â†’ Customer
```

The application must reject:

```text
Supplier â†’ Branch
```

## 3. Receiving lifecycle

```text
DRAFT
â†’ SUBMITTED
â†’ PENDING_APPROVAL
â†’ APPROVED
â†’ PROCESSING
â†’ POSTED
```

Exception states:

```text
REJECTED
CANCELLED
FAILED
REVERSED
```

## 4. Receipt requirements

A supplier receipt must identify:

- tenant;
- vendor;
- supplier;
- destination warehouse;
- purchase order where applicable;
- supplier delivery reference;
- supplier invoice reference where available;
- received date;
- received lines;
- ordered quantity;
- delivered quantity;
- accepted quantity;
- damaged quantity;
- quarantined quantity;
- rejected quantity;
- unit cost;
- batch, serial or expiry data where enabled;
- receiving actor;
- approval request;
- idempotency key.

## 5. Quantity rules

For each line:

```text
delivered quantity
=
accepted quantity
+
damaged quantity
+
quarantined quantity
+
rejected quantity
```

Only accepted quantity becomes available warehouse stock.

Damaged or quarantined quantities must use an explicit controlled stock condition.

Rejected quantities must not become available inventory.

Every line records `orderedQuantity`, `deliveredQuantity`, `acceptedQuantity`, `damagedQuantity`, `quarantinedQuantity`, `rejectedQuantity`, `previouslyReceivedQuantity`, `cumulativeReceivedQuantity`, and `outstandingQuantity`. No quantity may be silently clamped or discarded.

## 6. Purchase-order receiving

Where a purchase order exists:

- receipt quantities must reconcile to ordered and outstanding quantities;
- over-receipt must be blocked or require an approved tolerance;
- partial receiving must preserve outstanding quantities;
- full receiving must update the purchase-order state;
- a closed or cancelled order cannot receive stock.

## 7. Non-PO receipt

Non-PO receiving is prohibited by default.

Where enabled by vendor policy, it must require:

- appropriate permission;
- mandatory reason;
- supplier;
- warehouse;
- cost;
- approval;
- audit and BI events.

## 8. Atomic posting

Approval validation and consumption, inventory validation, stock-ledger posting, receipt completion, purchase-order update, command idempotency record, audit event and BI event must commit in one authoritative server transaction.

Duplicate idempotency keys must not create duplicate stock.

## 9. Reversal

A posted receipt cannot be directly deleted or edited.

Correction requires a controlled reversal that:

- references the original receipt;
- reverses applicable inventory movement;
- preserves original history;
- records reason and approver;
- updates purchase-order balances correctly.

Reversal uses deterministic idempotency and new `SUPPLIER_RECEIPT_REVERSAL` compensating movements for every affected stock bucket. Original receipt lines and movements remain immutable, and reversal cannot exceed the original unreversed quantity or the stock remaining in its disposition bucket.

## 10. Required events

- `SUPPLIER_RECEIPT_CREATED`
- `SUPPLIER_RECEIPT_SUBMITTED`
- `SUPPLIER_RECEIPT_APPROVED`
- `SUPPLIER_RECEIPT_REJECTED`
- `SUPPLIER_RECEIPT_POSTED`
- `SUPPLIER_RECEIPT_FAILED`
- `SUPPLIER_RECEIPT_REVERSED`
- `SUPPLIER_OVER_RECEIPT_BLOCKED`
- `NON_PO_RECEIPT_REQUESTED`
- `DAMAGED_STOCK_RECEIVED`

## 11. Acceptance criteria

- Branch receipt from a supplier is rejected.
- Accepted quantity increases warehouse stock once.
- Damaged or rejected quantity does not increase available stock.
- Duplicate receipt replay does not duplicate inventory.
- Partial receipt updates purchase-order outstanding quantity.
- Reversal creates compensating movements.
- Audit, BI and notification records are generated.
