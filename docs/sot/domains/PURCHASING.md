# Purchasing

## 1. Purpose and authority

Purchasing controls the request, approval, issue, receiving reconciliation and closure of supplier commitments. Purchasing does not create inventory. Supplier receiving remains the only source of supplier-originated warehouse stock.

Purchase-order creation and every authoritative lifecycle mutation execute through authenticated Firebase callable commands. The browser is not authoritative for tenant membership, permission, role, warehouse assignment, supplier or product ownership, approval eligibility, commercial totals, receipt balances, or event history.

## 2. Purchase requisition lifecycle

```text
DRAFT -> SUBMITTED -> PENDING_APPROVAL -> APPROVED -> CONVERTED_TO_PO
```

Exception states are `REJECTED`, `CANCELLED`, and `EXPIRED`.

## 3. Purchase-order lifecycle

The canonical states are:

```text
DRAFT
  -> SUBMITTED
  -> PENDING_APPROVAL
  -> APPROVED
  -> ISSUED
  -> PARTIALLY_RECEIVED
  -> RECEIVED
  -> CLOSED
```

Exception states are `REJECTED`, `CANCELLED`, and `FAILED`.

Allowed transitions are explicit:

| From | Allowed next states |
|---|---|
| `DRAFT` | `SUBMITTED`, `CANCELLED` |
| `SUBMITTED` | `PENDING_APPROVAL`, `CANCELLED` |
| `PENDING_APPROVAL` | `APPROVED`, `REJECTED`, `CANCELLED` |
| `APPROVED` | `ISSUED`, `CANCELLED` |
| `ISSUED` | `PARTIALLY_RECEIVED`, `RECEIVED`, `CANCELLED` |
| `PARTIALLY_RECEIVED` | `PARTIALLY_RECEIVED`, `RECEIVED`, `CANCELLED` |
| `RECEIVED` | `CLOSED` |
| `REJECTED`, `CANCELLED`, `CLOSED`, `FAILED` | none |

The submit command records both `DRAFT -> SUBMITTED` and `SUBMITTED -> PENDING_APPROVAL`; neither transition is implicit. A status history records actor, command, time, source state and target state.

## 4. Trusted command boundary

The authoritative callable commands are:

- `createPurchaseOrder`;
- `amendPurchaseOrder`;
- `submitPurchaseOrder`;
- `approvePurchaseOrder`;
- `rejectPurchaseOrder`;
- `cancelPurchaseOrder`;
- `issuePurchaseOrder`;
- `recordPurchaseOrderReceipt`;
- `closePurchaseOrder`.

Every command resolves Firebase identity and loads the active tenant membership and role inside the Firestore transaction. It checks the action permission and warehouse assignment at execution time. Browser-supplied actor, role, totals, supplier snapshots, product snapshots, approval status, or over-receipt authority are ignored.

`purchase_order.create` authorizes draft creation, draft amendment and submission. `purchase_order.approve` authorizes approval decisions, issue, closure, and cancellation after submission. A draft or submitted order may be cancelled by a user with create authority. Receipt accounting requires `receiving.approve` and matching supplier and destination warehouse authority.

## 5. Canonical structure and commercial authority

Each purchase order records `purchaseOrderId`, `tenantId`, `vendorId`, `supplierId`, `destinationWarehouseId`, `destinationLocationType`, `currency`, `status`, `version`, actor and lifecycle timestamps, totals, canonical lines, status history, and an approved commercial snapshot.

Each line records `lineId`, `productId`, immutable SKU and description snapshots, `orderedQuantity`, `unitCost`, discount, tax treatment and rate, `lineSubtotal`, `lineTax`, `lineTotal`, `receivedQuantity`, and `outstandingQuantity`.

The server validates finite, non-negative commercial values and calculates all subtotals, discount, tax, and total values using currency rounding. It obtains SKU and description snapshots from the tenant-owned active inventory product. Historic lines are never re-derived from mutable product records.

## 6. Warehouse-only destination

Supplier stock follows:

```text
Supplier -> Warehouse -> Branch -> Customer
```

Every stock-receiving PO references a tenant-owned, active, licensed warehouse. `BRANCH` and `TERMINAL` destinations are rejected. Warehouse assignment is enforced unless the membership has `location.all`.

## 7. Approval control

Submission creates a versioned purchase-order approval request. Approval and rejection require a current approval-request version and matching current PO resource version. Stale and duplicate decisions are rejected.

The decision service verifies current `purchase_order.approve` permission, active role, tenant, warehouse scope, configured amount/currency/role thresholds, and segregation of duties. Self-approval is prohibited by default and may only be enabled by an explicit tenant policy. Rejection requires a reason.

Approval grants purchasing authority only. It does not create inventory, a receipt, or an inventory movement.

## 8. Amendments and immutable history

Authorized users may amend commercial lines only while a PO is `DRAFT`, using the current expected version. After submission, commercial lines and totals cannot be silently rewritten. Approval stores the approved commercial snapshot.

An approved or issued PO requiring a commercial change must be cancelled with a reason and reissued as a new PO until a separately approved revision mechanism is introduced. Received portions and their history remain visible when a partially received order is cancelled.

## 9. Receiving integration

Supplier receiving consumes server-owned PO lines and balances. A receipt must match the PO supplier and destination warehouse and may apply only to `ISSUED` or `PARTIALLY_RECEIVED` orders.

The server uses ordered, previously received, and outstanding quantities. Over-receipt requires a current approved `ALLOW_OVER_RECEIPT` record for that PO or an explicitly approved over-receipt exception bundled with the receipt approval; a browser boolean is never authority. Additional partial accounting remains `PARTIALLY_RECEIVED`; all accounted lines transition to `RECEIVED`. Closure is a separate controlled `RECEIVED -> CLOSED` command.

Supplier receipt inventory posting remains governed by the canonical Inventory Posting Engine and the trusted receiving/reversal boundary. Receipt posting and PO received/outstanding accounting commit in the same server transaction. PO approval and issue never call the inventory engine.

## 10. Cancellation and closure

Cancellation always requires a reason and is state-dependent. `RECEIVED`, `CLOSED`, `REJECTED`, `CANCELLED`, and `FAILED` orders cannot be cancelled. Partially received cancellation retains received quantities and records the outstanding quantity closed by cancellation.

Received purchase orders cannot be deleted. `CLOSED` is reached only by explicit close command after `RECEIVED`.

## 11. Idempotency and events

Every command requires a stable `commandId`. Command results are stored in the server-only `purchase_order_commands` collection. Replaying the same command and action returns its first result and creates no duplicate PO, decision, lifecycle event, or issue/receipt effect. Reusing a command identity for a different action is rejected.

Trusted commands create immutable, deterministic audit and BI records for:

- `PURCHASE_ORDER_CREATED`;
- `PURCHASE_ORDER_SUBMITTED`;
- `PURCHASE_ORDER_APPROVAL_REQUESTED`;
- `PURCHASE_ORDER_APPROVED`;
- `PURCHASE_ORDER_REJECTED`;
- `PURCHASE_ORDER_CANCELLED`;
- `PURCHASE_ORDER_ISSUED`;
- `PURCHASE_ORDER_PARTIALLY_RECEIVED`;
- `PURCHASE_ORDER_RECEIVED`;
- `PURCHASE_ORDER_CLOSED`;
- `PURCHASE_ORDER_COMMAND_BLOCKED` and `PURCHASE_ORDER_COMMAND_FAILED` where a trusted tenant context can safely record the failure.

Events contain tenant, vendor, supplier, warehouse, user, PO, command, outcome, reason, amount, currency, occurred time, and recorded time. Ordinary browsers cannot create or mutate trusted PO events.

## 12. Acceptance criteria

- Purchase orders target active licensed warehouses only.
- The browser cannot directly create or mutate authoritative POs or PO decisions.
- Server calculations override all browser totals and product snapshots.
- Unauthorized, cross-tenant, stale, self, and over-threshold approval decisions are rejected.
- Approval and issue create no inventory movement.
- Issued commercial history is immutable.
- Partial and final receipt accounting updates outstanding quantities exactly once.
- Cancellation and closure obey explicit state rules and preserve history.
- Duplicate commands create no duplicate records or events.
- Security and inventory direct-write audits remain clean.
