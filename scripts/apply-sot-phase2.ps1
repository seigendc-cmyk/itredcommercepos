$ErrorActionPreference = "Stop"

# ============================================================
# iTredPOS OS SOT Phase 2
# Tenancy, Organisation, Purchasing, Receiving and Inventory
# Repository: seigendc-cmyk/itredcommercepos
# ============================================================

$Domains = "docs\sot\domains"

if (-not (Test-Path $Domains)) {
    throw "Missing SOT domains folder: $Domains"
}

@'
# Tenancy and Onboarding

## 1. Purpose

This document governs vendor tenant creation, default infrastructure provisioning, membership, trial access, SCI Console verification, subscription status and tenant isolation.

## 2. Tenant authority

Every operational record must belong to one authoritative vendor tenant.

Every tenant-scoped record must contain or inherit:

- `tenantId`
- `vendorId`
- record status
- creation timestamp
- creating actor
- record version where concurrent modification is possible

A `vendorId` supplied by the client must never, by itself, grant access to that vendor.

Tenant membership and permission must be resolved from trusted authentication and membership records.

## 3. Vendor lifecycle

Canonical vendor statuses:

```text
DRAFT
→ SUBMITTED
→ DEMO_ACTIVE
→ VERIFICATION_PENDING
→ VERIFIED
→ ACTIVE
```

Exception or terminal statuses:

```text
REJECTED
DEMO_EXPIRED
SUSPENDED
CANCELLED
ARCHIVED
```

## 4. Onboarding transaction

Successful onboarding must provision, idempotently:

1. Vendor tenant.
2. Vendor owner membership.
3. One default warehouse.
4. One default branch.
5. One default terminal belonging to the default branch.
6. Starter Plan entitlement.
7. Seven-day demo period.
8. SCI Console verification submission.
9. Audit event.
10. BI event.
11. Vendor-owner notification.

Provisioning must either complete as one controlled workflow or leave an explicit recoverable failure state.

Repeated onboarding requests with the same idempotency key must not create duplicate tenants, warehouses, branches, terminals or memberships.

## 5. Default infrastructure

Every new vendor receives:

| Resource | Included quantity |
|---|---:|
| Warehouse | 1 |
| Branch | 1 |
| POS terminal | 1 |

The default terminal must belong to the default branch.

A terminal cannot belong directly to a warehouse.

## 6. Seven-day demo access

The demo period begins only when tenant provisioning succeeds.

The vendor record must contain:

- `demoStartedAt`
- `demoExpiresAt`
- `entitlementStatus`
- `verificationStatus`

Demo expiry must not delete business records.

When demo access expires:

- new operational transactions may be restricted according to entitlement policy;
- historical records remain available according to role and retention rules;
- pending synchronization and reconciliation must not be discarded;
- the tenant may be reactivated after licensing.

## 7. SCI Console verification

iTred Commerce POS and SCI Console are separate applications using approved shared database structures.

Successful onboarding must submit a verification record containing:

- tenant ID;
- vendor ID;
- legal or trading name;
- owner identity;
- contact details;
- business address;
- registration information where supplied;
- onboarding timestamp;
- demo expiry;
- verification status;
- source application;
- record version.

SCI Console verification statuses:

```text
PENDING
UNDER_REVIEW
INFORMATION_REQUIRED
APPROVED
REJECTED
SUSPENDED
```

SCI Console decisions must be auditable.

## 8. Membership

A membership must identify:

- tenant;
- user UID;
- role;
- assigned warehouses;
- assigned branches;
- assigned terminals where applicable;
- status;
- effective date;
- expiry where applicable;
- permission version.

Membership statuses:

```text
INVITED
ACTIVE
SUSPENDED
REVOKED
EXPIRED
```

## 9. Tenant isolation

The application must reject:

- cross-vendor reads;
- cross-vendor writes;
- cross-vendor stock movements;
- cross-vendor sales;
- cross-vendor approvals;
- cross-vendor reports;
- cross-vendor BI access.

Privileged SCI support access must be explicit, permission-controlled and audited.

## 10. Required events

At minimum:

- `TENANT_ONBOARDING_STARTED`
- `TENANT_ONBOARDING_COMPLETED`
- `TENANT_ONBOARDING_FAILED`
- `DEFAULT_WAREHOUSE_PROVISIONED`
- `DEFAULT_BRANCH_PROVISIONED`
- `DEFAULT_TERMINAL_PROVISIONED`
- `MEMBERSHIP_CREATED`
- `DEMO_STARTED`
- `DEMO_EXPIRED`
- `VERIFICATION_SUBMITTED`
- `VERIFICATION_STATUS_CHANGED`
- `TENANT_SUSPENDED`
- `TENANT_REACTIVATED`

## 11. Acceptance criteria

- Repeating onboarding does not duplicate resources.
- Warehouse, branch and terminal belong to the same tenant.
- Default terminal belongs to the default branch.
- A user from another tenant cannot read or modify the tenant.
- Seven-day demo dates are persisted.
- SCI Console verification record is created.
- Failed provisioning produces an explicit recoverable status.
- Audit and BI events are generated.
'@ | Set-Content "$Domains\TENANCY_AND_ONBOARDING.md" -Encoding utf8

@'
# Organisation Structure

## 1. Canonical hierarchy

```text
Vendor tenant
├── Warehouse
└── Branch
    └── POS terminal
```

A warehouse and branch are stock locations with different operational capabilities.

## 2. Location types

```typescript
type StockLocationType =
  | "WAREHOUSE"
  | "BRANCH";
```

## 3. Warehouse capabilities

A warehouse may:

- receive supplier deliveries;
- hold central inventory;
- issue warehouse-to-branch transfers;
- receive branch returns;
- return stock to suppliers;
- perform stocktakes;
- hold damaged or quarantined stock;
- process inventory adjustments through controlled workflows.

A warehouse must not:

- host a POS terminal;
- operate a sales cart;
- process customer checkout;
- complete a customer sale;
- provide warehouse stock directly to a branch checkout.

## 4. Branch capabilities

A branch may:

- receive warehouse transfers;
- hold branch inventory;
- host one or more licensed POS terminals;
- operate carts;
- complete customer sales;
- process controlled returns;
- perform branch stocktakes.

A branch must not receive supplier deliveries directly.

## 5. Terminal rules

Every active terminal must:

- belong to one vendor;
- belong to one branch;
- never belong to a warehouse;
- have an active licence or entitlement;
- have a unique terminal identifier;
- record application and device context;
- be auditable.

Every sale must contain:

- `tenantId`
- `vendorId`
- `branchId`
- `terminalId`
- `cashierId`
- `shiftId`
- `stockLocationId`

For a customer sale, `stockLocationId` must resolve to the selling branch.

## 6. Resource states

Warehouses, branches and terminals use:

```text
PROVISIONING
ACTIVE
SUSPENDED
ARCHIVED
```

A suspended or archived resource must retain historical records.

Suspension must prevent new transactions but must not delete:

- sales;
- shifts;
- inventory movements;
- stocktakes;
- approvals;
- BI events;
- audit records.

## 7. Subscription controls

The Starter Plan includes:

- one warehouse;
- one branch;
- one terminal.

Additional warehouses, branches and terminals require separate active entitlements.

A resource may exist in a non-operational state before licensing, but it must not transact until licensed and activated.

## 8. Required events

- `WAREHOUSE_CREATED`
- `WAREHOUSE_ACTIVATED`
- `WAREHOUSE_SUSPENDED`
- `BRANCH_CREATED`
- `BRANCH_ACTIVATED`
- `BRANCH_SUSPENDED`
- `TERMINAL_CREATED`
- `TERMINAL_ACTIVATED`
- `TERMINAL_SUSPENDED`
- `RESOURCE_LICENSE_BLOCKED`

## 9. Acceptance criteria

- Supplier receipt into a branch is rejected.
- Cart operation in a warehouse is rejected.
- Terminal creation under a warehouse is rejected.
- A terminal cannot transact when suspended or unlicensed.
- Historical records remain accessible after resource suspension.
'@ | Set-Content "$Domains\ORGANISATION_STRUCTURE.md" -Encoding utf8

@'
# Purchasing

## 1. Purpose

Purchasing controls the request, approval, ordering and monitoring of goods before supplier receiving.

Purchasing does not create inventory.

## 2. Purchase requisition lifecycle

```text
DRAFT
→ SUBMITTED
→ PENDING_APPROVAL
→ APPROVED
→ CONVERTED_TO_PO
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
→ PENDING_APPROVAL
→ APPROVED
→ ISSUED
→ PARTIALLY_RECEIVED
→ FULLY_RECEIVED
→ CLOSED
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
'@ | Set-Content "$Domains\PURCHASING.md" -Encoding utf8

@'
# Supplier Receiving

## 1. Purpose

Supplier receiving records delivered goods and creates supplier-originated warehouse inventory.

## 2. Destination rule

Supplier stock must be received into a warehouse.

The following flow is mandatory:

```text
Supplier → Warehouse → Branch → Customer
```

The application must reject:

```text
Supplier → Branch
```

## 3. Receiving lifecycle

```text
DRAFT
→ SUBMITTED
→ PENDING_APPROVAL
→ APPROVED
→ PROCESSING
→ POSTED
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
rejected quantity
```

Only accepted quantity becomes available warehouse stock.

Damaged or quarantined quantities must use an explicit controlled stock condition.

Rejected quantities must not become available inventory.

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

Approval, inventory validation, stock-ledger posting, receipt completion, purchase-order update, audit event and BI event should commit atomically where supported.

Duplicate idempotency keys must not create duplicate stock.

## 9. Reversal

A posted receipt cannot be directly deleted or edited.

Correction requires a controlled reversal that:

- references the original receipt;
- reverses applicable inventory movement;
- preserves original history;
- records reason and approver;
- updates purchase-order balances correctly.

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
'@ | Set-Content "$Domains\SUPPLIER_RECEIVING.md" -Encoding utf8

@'
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
'@ | Set-Content "$Domains\INVENTORY_LEDGER.md" -Encoding utf8

Write-Host ""
Write-Host "Phase 2 file sizes:" -ForegroundColor Cyan

Get-Item `
  "$Domains\TENANCY_AND_ONBOARDING.md", `
  "$Domains\ORGANISATION_STRUCTURE.md", `
  "$Domains\PURCHASING.md", `
  "$Domains\SUPPLIER_RECEIVING.md", `
  "$Domains\INVENTORY_LEDGER.md" |
    Select-Object Name, Length

Write-Host ""
Write-Host "Git changes:" -ForegroundColor Cyan

git status --short
git diff --stat
