# Purchasing

## 1. Purpose

Purchasing controls the request, approval, ordering and monitoring of goods before supplier receiving.

Purchasing does not create inventory.

## 2. Purchase requisition lifecycle

```text
DRAFT
â†’ SUBMITTED
â†’ PENDING_APPROVAL
â†’ APPROVED
â†’ CONVERTED_TO_PO
```

Exception states:

```text
REJECTED
CANCELLED
EXPIRED
```

## 3. Purchase order lifecycle

```text
DRAFT
â†’ PENDING_APPROVAL
â†’ APPROVED
â†’ ISSUED
â†’ PARTIALLY_RECEIVED
â†’ FULLY_RECEIVED
â†’ CLOSED
```

Exception states:

```text
REJECTED
CANCELLED
EXPIRED
DISPUTED
```

## 4. Purchase-order requirements

A purchase order must identify:

- tenant;
- vendor;
- supplier;
- delivery warehouse;
- currency;
- line items;
- ordered quantity;
- unit cost;
- expected tax;
- expected total;
- expected delivery date;
- payment terms;
- requester;
- approver where required;
- version;
- idempotency key.

## 5. Purchasing invariants

- Purchase approval does not increase stock.
- Purchase-order issue does not increase stock.
- Only a posted supplier receipt creates supplier-originated inventory.
- The delivery destination must be a warehouse.
- A cancelled or closed purchase order cannot receive more stock.
- Partial receipt preserves outstanding quantity.
- Purchase-order totals must be calculated by trusted domain logic.
- Issued purchase orders cannot be silently rewritten.
- Material revision requires versioning and approval.

## 6. Approval thresholds

Approval policies may be based on:

- purchase value;
- currency;
- supplier;
- product category;
- requester role;
- warehouse;
- exceptional pricing;
- non-preferred supplier;
- budget or purchasing limit.

The system must support segregation of duties.

## 7. Cancellation

A purchase order may be cancelled only when:

- the actor has permission;
- the reason is recorded;
- cancellation does not conceal received stock;
- outstanding quantities are closed correctly;
- received portions remain historically traceable.

A partially received order must not be represented as never received.

## 8. Required events

- `PURCHASE_REQUEST_CREATED`
- `PURCHASE_REQUEST_SUBMITTED`
- `PURCHASE_REQUEST_APPROVED`
- `PURCHASE_REQUEST_REJECTED`
- `PURCHASE_ORDER_CREATED`
- `PURCHASE_ORDER_APPROVED`
- `PURCHASE_ORDER_ISSUED`
- `PURCHASE_ORDER_PARTIALLY_RECEIVED`
- `PURCHASE_ORDER_FULLY_RECEIVED`
- `PURCHASE_ORDER_CANCELLED`
- `PURCHASE_PRICE_VARIANCE_DETECTED`

## 9. Required notifications

- purchase approval required;
- purchase approved;
- purchase rejected;
- expected delivery overdue;
- purchase partially received;
- purchase fully received;
- purchase price variance;
- purchase cancellation.

## 10. Acceptance criteria

- Purchase order cannot target a branch.
- Purchase order does not change inventory.
- Unauthorized approval is rejected.
- Duplicate issue is idempotently rejected.
- Partial receiving updates outstanding quantity correctly.
- Cancelled order cannot receive additional quantities.
- Events and notifications are generated.
