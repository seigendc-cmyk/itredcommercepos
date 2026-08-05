# Inventory Ledger

## 1. Authority

The inventory ledger is the authoritative history of stock movement.

Current balances must reconcile to ledger movements.

## 2. Movement types

```text
OPENING_BALANCE
SUPPLIER_RECEIPT
SUPPLIER_RETURN
TRANSFER_DISPATCH
TRANSFER_RECEIPT
TRANSFER_REVERSAL
SALE
SALE_VOID
CUSTOMER_RETURN
STOCKTAKE_ADJUSTMENT
DAMAGE
EXPIRY
LOSS
FOUND_STOCK
MANUAL_ADJUSTMENT
RESERVATION
RESERVATION_RELEASE
```

## 3. Movement structure

Every movement must contain:

- `movementId`
- `tenantId`
- `vendorId`
- `locationId`
- `locationType`
- `productId`
- `variantId` where applicable
- `movementType`
- `quantityDelta`
- `beforeQuantity`
- `afterQuantity`
- `unitCost` where applicable
- `sourceType`
- `sourceId`
- `actorId`
- `occurredAt`
- `recordedAt`
- `idempotencyKey`
- `reasonCode` where applicable
- `approvalRequestId` where applicable
- `correlationId`

## 4. Stock states

The system must distinguish where applicable:

- physical stock;
- available stock;
- reserved stock;
- in-transit stock;
- damaged stock;
- quarantined stock.

## 5. Immutability

Posted movements cannot be directly edited or deleted.

Corrections require:

- reversal movement;
- compensating movement; or
- approved adjustment movement.

## 6. Location rules

- Supplier receipt increases warehouse stock only.
- Transfer dispatch reduces warehouse available stock and creates in-transit stock.
- Transfer receipt reduces in-transit stock and increases branch stock.
- Sale reduces branch stock.
- Warehouse stock cannot be used directly by branch checkout.
- Cross-tenant movement is prohibited.

## 7. Negative stock

Negative available stock is prohibited by default.

The system must not clamp a negative value to zero to conceal insufficient stock.

Insufficient stock must reject the transaction.

## 8. Concurrency

Inventory-changing commands must:

- read current authoritative balance;
- validate quantity;
- write movement;
- update balance;
- update source transaction;
- create audit event;
- create BI event;

within one controlled transaction where supported.

## 9. Idempotency

Receiving, transfer, sale, reversal and stocktake posting must use stable idempotency keys.

Replaying an accepted command must not create an additional movement.

## 10. Required reports

- stock on hand;
- available stock;
- in-transit stock;
- damaged and quarantined stock;
- movement ledger;
- inventory valuation;
- low stock;
- negative-stock attempts;
- adjustments;
- ageing or slow-moving stock where supported.

## 11. Acceptance criteria

- Every balance-changing operation has a ledger movement.
- Ledger totals reconcile to location balance.
- Cross-tenant movement is rejected.
- Insufficient stock does not create partial movement.
- Duplicate command replay does not duplicate movement.
- Historical movements remain immutable.
