# Sales and Checkout

## 1. Purpose

Sales and checkout govern cart operation, pricing, payment, inventory deduction, receipt generation and sale correction.

## 2. Sales location

Only a branch may operate a cart and complete a customer sale.

A warehouse must not:

- operate a cart;
- host a sales terminal;
- complete customer checkout;
- supply warehouse stock directly to a branch sale.

## 3. Cart requirements

A cart must belong to:

- tenant;
- vendor;
- branch;
- terminal;
- cashier;
- shift;
- currency;
- pricing context;
- tax context;
- cart version.

A cart must not combine:

- different vendors;
- different branches;
- different terminals;
- different shifts.

## 4. Cart lifecycle

```text
ACTIVE
â†’ PAYMENT_PENDING
â†’ POSTING
â†’ COMPLETED
â†’ RECEIPTED
```

Exception states:

```text
ABANDONED
CANCELLED
FAILED
BLOCKED
```

Controlled offline lifecycle:

```text
ACTIVE
â†’ OFFLINE_VALIDATED
â†’ COMPLETED_PENDING_SYNC
â†’ SYNCING
â†’ SYNCHRONIZED
```

Offline exception states:

```text
SYNC_FAILED
SYNC_REJECTED
RECONCILIATION_REQUIRED
```

## 5. Product validation

Before adding or posting a sale item, the system must validate:

- product belongs to vendor;
- product is active;
- product is sellable;
- branch price is valid;
- tax treatment is valid;
- requested quantity is permitted;
- branch stock is sufficient;
- terminal and shift remain active.

The UI cache is not the authoritative inventory source.

## 6. Pricing

Trusted domain logic must calculate:

- base selling price;
- tax;
- discount;
- price override;
- line total;
- sale subtotal;
- sale tax;
- sale discount;
- sale grand total.

Client-supplied totals must be revalidated.

## 7. Discounts and price overrides

Discount and price-override policies may depend on:

- user permission;
- product;
- category;
- discount percentage;
- discount amount;
- margin threshold;
- branch;
- customer;
- campaign;
- approval threshold.

Every override must record:

- original value;
- changed value;
- reason;
- actor;
- approver where required;
- audit event;
- BI event.

## 8. Inventory authority

Sale completion must use current authoritative branch inventory.

The system must reject the entire sale when any required line has insufficient stock.

It must not:

- partially post a sale unless explicitly designed as a separate approved flow;
- clamp an insufficient balance to zero;
- deduct warehouse stock;
- create a completed sale after failed authoritative posting.

## 9. Atomic sale posting

The following must commit atomically where supported:

- sale header;
- sale lines;
- payment records;
- branch stock deductions;
- inventory ledger movements;
- receipt sequence allocation;
- shift totals;
- audit event;
- BI event;
- required notifications.

Failure must not leave a partially completed commercial transaction.

## 10. Idempotency

Every checkout attempt must use a stable unique checkout attempt ID.

Replaying the same accepted attempt must return the existing completed sale rather than:

- creating a duplicate sale;
- deducting stock again;
- creating duplicate payments;
- issuing another receipt number.

## 11. Sale record

A completed sale must contain:

- sale ID;
- receipt number;
- tenant;
- vendor;
- branch;
- terminal;
- shift;
- cashier;
- customer where applicable;
- line items;
- quantity;
- price;
- tax;
- discount;
- cost snapshot where permitted;
- subtotal;
- grand total;
- payment records;
- sale status;
- offline status;
- timestamps;
- checkout attempt ID;
- record version.

## 12. Receipt

A completed sale must produce a receipt record.

Receipt reprinting must:

- reference the original sale;
- retain the original receipt number;
- record the reprint actor and time;
- not create another sale;
- not deduct stock again.

## 13. Offline checkout

Controlled offline checkout is permitted only when all approved controls pass, including:

- enrolled device;
- authenticated tenant;
- valid branch;
- valid terminal;
- valid cashier;
- valid shift;
- valid local price data;
- valid local tax data;
- valid local stock authority;
- permitted payment method;
- encrypted local storage;
- durable outbox;
- idempotency;
- BI event capture;
- synchronization status.

An offline-completed sale must use:

```text
COMPLETED_PENDING_SYNC
```

It must not be represented as synchronized until authoritative server acknowledgement is received.

## 14. Corrections

Posted sales cannot be directly edited.

Corrections require:

- void;
- full refund;
- partial refund;
- customer return;
- payment correction where approved.

Each correction must reference the original sale.

## 15. Required events

- `CART_CREATED`
- `CART_ITEM_ADDED`
- `CART_ITEM_BLOCKED`
- `PRICE_OVERRIDE_REQUESTED`
- `PRICE_OVERRIDE_APPROVED`
- `DISCOUNT_APPLIED`
- `CHECKOUT_STARTED`
- `SALE_COMPLETED`
- `SALE_FAILED`
- `SALE_BLOCKED_INSUFFICIENT_STOCK`
- `SALE_COMPLETED_OFFLINE`
- `SALE_SYNC_STARTED`
- `SALE_SYNCHRONIZED`
- `SALE_SYNC_REJECTED`
- `RECEIPT_ISSUED`
- `RECEIPT_REPRINTED`
- `SALE_VOIDED`
- `SALE_REFUNDED`

## 16. Notifications

Notifications should be generated for:

- approval-required discount;
- approval-required override;
- failed sale posting;
- offline synchronization failure;
- rejected synchronized sale;
- high-risk void;
- high-risk refund;
- repeated blocked sale attempts.

## 17. Acceptance criteria

- Warehouse cart operation is rejected.
- Closed or missing shift blocks checkout.
- Terminal-branch mismatch blocks checkout.
- Insufficient branch stock rejects the entire sale.
- Sale and stock movements post atomically.
- Duplicate checkout replay does not duplicate sale or stock deduction.
- Offline sale remains pending synchronization until acknowledged.
- Receipt reprint does not create a new transaction.
