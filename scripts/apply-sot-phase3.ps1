$ErrorActionPreference = "Stop"

# ============================================================
# iTredPOS OS SOT Phase 3
# Stocktake, Shifts, Sales, Payments, Approvals, BI,
# Notifications, Reporting and Contracts
# Repository: seigendc-cmyk/itredcommercepos
# ============================================================

$Domains = "docs\sot\domains"
$Contracts = "docs\sot\contracts"

if (-not (Test-Path $Domains)) {
    throw "Missing SOT domains folder: $Domains"
}

if (-not (Test-Path $Contracts)) {
    throw "Missing SOT contracts folder: $Contracts"
}

@'
# Stocktake and Adjustments

## 1. Purpose

Stocktake verifies physical inventory against the authoritative inventory ledger.

A stocktake count does not directly change inventory.

Only an approved stocktake adjustment posting may change inventory balances.

## 2. Supported stocktake types

The industrial MVP must support:

- full warehouse stocktake;
- full branch stocktake;
- category stocktake;
- product-specific count;
- cycle count;
- random spot check;
- risk-triggered spot check;
- shift-close spot check.

## 3. Stocktake lifecycle

```text
PLANNED
→ ASSIGNED
→ IN_PROGRESS
→ COUNT_SUBMITTED
→ PENDING_REVIEW
```

Where no recount is required:

```text
PENDING_REVIEW
→ PENDING_APPROVAL
→ APPROVED
→ ADJUSTMENT_POSTING
→ ADJUSTMENT_POSTED
→ CLOSED
```

Where a recount is required:

```text
PENDING_REVIEW
→ RECOUNT_REQUIRED
→ RECOUNT_ASSIGNED
→ RECOUNT_IN_PROGRESS
→ RECOUNT_SUBMITTED
→ PENDING_APPROVAL
```

Exception states:

```text
CANCELLED
REJECTED
DISPUTED
FAILED
```

## 4. Stocktake scope

Every stocktake must identify:

- tenant;
- vendor;
- warehouse or branch;
- stocktake type;
- product scope;
- category scope where applicable;
- planned start;
- count deadline;
- assigned counters;
- reviewers;
- approvers;
- blind-count policy;
- snapshot timestamp;
- stocktake version;
- risk trigger where applicable.

A stocktake cannot combine locations from different tenants.

## 5. Expected stock snapshot

At stocktake start, the system must create or reference an authoritative expected-stock snapshot.

The snapshot must preserve:

- product;
- variant where applicable;
- location;
- expected quantity;
- available quantity;
- reserved quantity where applicable;
- damaged or quarantined quantity where applicable;
- snapshot time;
- source ledger position or version.

The original expected quantity must remain historically traceable.

## 6. Movement during stocktake

The system must define whether the location is:

- transaction-frozen;
- partially frozen;
- operating under movement tracking.

Where operations continue during a count, all stock movements occurring after the snapshot must remain identifiable and available during reconciliation.

The system must not silently compare a physical count against an outdated quantity without accounting for movements during the count window.

## 7. Blind count

When blind count is enabled:

- counters must not see expected quantity;
- counters must not see previous counter results unless assigned to investigate;
- counters may see product identity, barcode and physical location;
- the system must still preserve the expected snapshot internally.

## 8. Count entries

Each count entry must contain:

- stocktake ID;
- stocktake line ID;
- tenant;
- location;
- product;
- variant where applicable;
- counted quantity;
- counter;
- count sequence;
- count timestamp;
- device;
- offline status;
- reason or note where applicable;
- record version.

Count entry changes must remain auditable.

A submitted count must not be silently overwritten.

Corrections require a new count revision or recount entry.

## 9. Variance

For each product:

```text
quantity variance
=
approved physical quantity
-
reconciled expected quantity
```

Value variance must use an approved valuation basis.

Variance records must contain:

- expected quantity;
- first count;
- recount quantity where applicable;
- approved physical quantity;
- quantity variance;
- unit valuation;
- value variance;
- reason code;
- investigation notes;
- reviewer;
- approver.

## 10. Recount rules

Recount may be required when:

- quantity variance exceeds threshold;
- value variance exceeds threshold;
- high-risk product is involved;
- first count is incomplete;
- repeated corrections occur;
- the system detects unusual counter behaviour;
- reviewer requests recount.

The first counter should not automatically perform the recount where segregation of duties is enabled.

## 11. Approval

A stocktake adjustment must require approval according to vendor policy.

Approval policy may consider:

- quantity variance;
- value variance;
- product risk class;
- location;
- counter;
- recurring variance;
- stocktake type;
- reason code.

A counter may not approve their own material adjustment when segregation of duties is enabled.

## 12. Adjustment posting

Approved stocktake differences must create append-only inventory ledger movements with type:

```text
STOCKTAKE_ADJUSTMENT
```

Adjustment posting must include:

- before quantity;
- approved delta;
- after quantity;
- stocktake ID;
- stocktake line ID;
- approver;
- reason;
- idempotency key;
- audit event;
- BI event.

Posting must be idempotent.

Repeated posting of the same approved stocktake must not create duplicate movements.

## 13. Stocktake BI events

Required events include:

- `STOCKTAKE_PLANNED`
- `STOCKTAKE_ASSIGNED`
- `STOCKTAKE_STARTED`
- `STOCKTAKE_COUNT_SUBMITTED`
- `STOCKTAKE_COUNT_AMENDED`
- `STOCKTAKE_RECOUNT_REQUIRED`
- `STOCKTAKE_RECOUNT_SUBMITTED`
- `STOCKTAKE_VARIANCE_DETECTED`
- `STOCKTAKE_VARIANCE_APPROVED`
- `STOCKTAKE_VARIANCE_REJECTED`
- `STOCKTAKE_ADJUSTMENT_POSTED`
- `STOCKTAKE_FAILED`
- `REPEATED_STOCK_VARIANCE_DETECTED`

## 14. Notifications

The system must notify relevant users when:

- a stocktake is assigned;
- a count deadline approaches;
- a count is overdue;
- a recount is required;
- material variance is detected;
- approval is required;
- adjustment is approved or rejected;
- posting fails.

## 15. Reports

Required reports include:

- stocktake progress;
- incomplete counts;
- quantity variance;
- value variance;
- variance by product;
- variance by category;
- variance by location;
- variance by counter;
- recurring variance;
- approved adjustments;
- unresolved disputes.

## 16. Acceptance criteria

- Blind counters cannot view expected quantity.
- Submitted counts remain historically traceable.
- Stock movements during the count window are reconciled.
- A count alone does not change inventory.
- Unauthorized approval is rejected.
- Approved adjustment posts exactly once.
- Rejected variance creates no stock movement.
- Audit, BI and notification records are generated.
'@ | Set-Content "$Domains\STOCKTAKE_AND_ADJUSTMENTS.md" -Encoding utf8

@'
# Shift and Cash Control

## 1. Purpose

Shift control links every POS sale and cash movement to an authorized cashier, branch, terminal and operating period.

## 2. Shift lifecycle

```text
SCHEDULED
→ OPEN
→ CLOSING
→ CLOSED
```

Exception states:

```text
SUSPENDED
REOPEN_PENDING_APPROVAL
REOPENED
CANCELLED
FAILED
```

## 3. Shift opening

A shift may open only when:

- the user has shift-opening permission;
- the user belongs to the vendor;
- the user is assigned to the branch;
- the terminal is active;
- the terminal belongs to the branch;
- the terminal is licensed;
- no prohibited conflicting shift exists;
- the opening float is recorded;
- required online or offline authority is valid.

A warehouse cannot open a POS shift.

## 4. Shift identity

Every shift must identify:

- tenant;
- vendor;
- branch;
- terminal;
- cashier;
- opening actor;
- opening time;
- opening float;
- currency;
- application version;
- device;
- offline status;
- shift sequence or number;
- status;
- version.

## 5. Sale association

Every completed sale must belong to exactly one open shift.

The system must reject:

- sale without a shift;
- sale against a closed shift;
- sale against a shift from another branch;
- sale against a shift from another terminal;
- sale by an unauthorized cashier.

## 6. Cash movements

Controlled cash movements include:

- opening float;
- cash sale receipts;
- cash refund;
- paid-in;
- paid-out;
- cash drop;
- safe transfer;
- correction or reversal.

Every movement must contain:

- shift;
- amount;
- currency;
- direction;
- movement type;
- actor;
- reason;
- approval where required;
- timestamp;
- reference;
- audit event;
- BI event.

## 7. Expected cash

Expected cash must be system-calculated from authoritative shift transactions.

```text
expected closing cash
=
opening float
+
cash sales
+
paid-in
-
cash refunds
-
paid-out
-
cash drops
± approved corrections
```

Expected cash must not be accepted from a client-calculated total without server or domain verification.

## 8. Shift closing

Shift closing must record:

- expected cash;
- counted cash;
- cash variance;
- payment-method totals;
- sales count;
- refund total;
- void total;
- discount total;
- cash movements;
- offline pending transactions;
- closing actor;
- closing timestamp;
- notes.

## 9. Variance control

```text
cash variance
=
counted cash
-
expected cash
```

Variance thresholds may determine:

- automatic closure;
- manager review;
- approval requirement;
- mandatory investigation;
- BI severity;
- notification escalation.

The cashier must not approve their own material cash variance when segregation of duties is enabled.

## 10. Closed-shift integrity

A closed shift must not accept new sales.

A closed shift must not be silently edited.

Corrections require a controlled reopening, compensating transaction or adjustment workflow.

## 11. Required events

- `SHIFT_OPENED`
- `SHIFT_OPEN_FAILED`
- `CASH_MOVEMENT_RECORDED`
- `CASH_MOVEMENT_BLOCKED`
- `SHIFT_CLOSING_STARTED`
- `SHIFT_VARIANCE_DETECTED`
- `SHIFT_VARIANCE_APPROVAL_REQUIRED`
- `SHIFT_VARIANCE_APPROVED`
- `SHIFT_VARIANCE_REJECTED`
- `SHIFT_CLOSED`
- `SHIFT_REOPEN_REQUESTED`
- `SHIFT_REOPENED`
- `DELAYED_SHIFT_CLOSURE_DETECTED`

## 12. Acceptance criteria

- Warehouse shift opening is rejected.
- Sale without an open shift is rejected.
- Terminal and shift branch mismatch is rejected.
- Expected cash is calculated from authoritative records.
- Material variance follows approval policy.
- Closed shift cannot receive new sales.
- Shift reopening is controlled and audited.
'@ | Set-Content "$Domains\SHIFT_AND_CASH_CONTROL.md" -Encoding utf8

@'
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
→ PAYMENT_PENDING
→ POSTING
→ COMPLETED
→ RECEIPTED
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
→ OFFLINE_VALIDATED
→ COMPLETED_PENDING_SYNC
→ SYNCING
→ SYNCHRONIZED
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
'@ | Set-Content "$Domains\SALES_AND_CHECKOUT.md" -Encoding utf8

@'
# Payments and Receipts

## 1. Purpose

Payments record the value received or owed for a sale.

Receipts provide an immutable customer-facing reference to the completed sale.

## 2. Payment methods

The MVP may support configured methods including:

- cash;
- card;
- mobile money;
- bank transfer;
- customer account;
- split payment;
- other approved tender types.

Availability may depend on:

- tenant;
- branch;
- terminal;
- online or offline status;
- currency;
- entitlement;
- integration status.

## 3. Payment record

Every payment must contain:

- payment ID;
- tenant;
- vendor;
- sale;
- branch;
- terminal;
- shift;
- payment method;
- amount;
- currency;
- status;
- external reference where applicable;
- collected actor;
- occurred time;
- offline status;
- idempotency key;
- reversal reference where applicable.

## 4. Payment statuses

```text
PENDING
AUTHORIZED
COMPLETED
FAILED
CANCELLED
REVERSED
REFUNDED
PARTIALLY_REFUNDED
```

## 5. Tender validation

The sum of accepted payments must reconcile to the sale amount according to the permitted tender rules.

Overpayment and change rules must be explicit.

Cash change must not be represented as additional revenue.

## 6. Split payment

Split payment must:

- belong to one sale;
- preserve each tender component;
- reconcile to the final amount;
- fail safely when one component fails;
- follow an approved rollback or pending-payment policy.

## 7. External payments

Where a payment provider is used:

- provider response must be recorded;
- sensitive card data must not be stored;
- client claims must not replace provider or trusted confirmation;
- retries must be idempotent;
- reconciliation status must be visible.

## 8. Receipt numbering

Receipt numbering must be:

- unique within the approved numbering scope;
- immutable after issue;
- traceable to vendor, branch and terminal;
- resistant to duplicate assignment;
- compatible with offline numbering rules.

The numbering scope must be documented in the technical contract.

## 9. Receipt contents

A receipt should include:

- vendor identity;
- branch;
- terminal;
- receipt number;
- sale ID;
- date and time;
- cashier;
- sale items;
- quantities;
- prices;
- discounts;
- taxes;
- total;
- payment methods;
- change where applicable;
- fiscal status where applicable;
- offline or pending-sync status where required.

## 10. Reprinting

Receipt reprinting must:

- retain original details;
- record reprint actor;
- record reason where policy requires;
- generate a BI event;
- not issue another receipt number;
- not create another payment or sale.

## 11. Acceptance criteria

- Payment total reconciles to sale total.
- Duplicate payment replay does not duplicate payment.
- Failed external payment does not produce a completed sale unless an approved pending-payment flow exists.
- Receipt numbers are not duplicated.
- Reprinting does not alter the sale.
'@ | Set-Content "$Domains\PAYMENTS_AND_RECEIPTS.md" -Encoding utf8

@'
# Returns, Voids and Refunds

## 1. Principle

Posted sales cannot be directly edited or deleted.

Corrections must use controlled, linked and auditable transactions.

## 2. Void

A void applies only under the approved timing and status policy.

A void must:

- reference the original sale;
- record reason;
- identify actor;
- require approval where applicable;
- reverse stock where appropriate;
- reverse or cancel payment where appropriate;
- generate audit and BI events.

## 3. Customer return

A return must identify:

- original sale;
- original sale line;
- returned quantity;
- return condition;
- return location;
- reason;
- actor;
- customer where applicable;
- approval;
- inventory effect;
- payment effect.

Returned stock must be classified as:

- available;
- damaged;
- quarantined;
- rejected.

It must not automatically become available stock without condition validation.

## 4. Refund

Refund types:

- full refund;
- partial refund;
- payment-method refund;
- customer account credit where approved.

Refund value must not exceed eligible remaining value from the original sale.

## 5. State integrity

Correction transactions must preserve:

- original sale;
- previous refunds;
- remaining refundable quantity;
- remaining refundable value;
- original payment method;
- inventory effects;
- approval history.

## 6. Approval triggers

Approval may be required based on:

- refund value;
- return quantity;
- return without receipt;
- return age;
- damaged condition;
- cash refund;
- user role;
- repeated refund behaviour;
- suspected abuse.

## 7. Required events

- `VOID_REQUESTED`
- `VOID_APPROVED`
- `VOID_REJECTED`
- `SALE_VOIDED`
- `RETURN_CREATED`
- `RETURN_APPROVED`
- `RETURN_REJECTED`
- `REFUND_REQUESTED`
- `REFUND_APPROVED`
- `REFUND_REJECTED`
- `REFUND_COMPLETED`
- `RETURN_WITHOUT_RECEIPT_ATTEMPTED`
- `REFUND_LIMIT_BLOCKED`

## 8. Acceptance criteria

- Original completed sale remains immutable.
- Refund cannot exceed remaining eligible value.
- Return cannot exceed remaining eligible quantity.
- Inventory disposition is explicit.
- Unauthorized correction is rejected.
- Duplicate refund replay does not duplicate payment or stock effects.
'@ | Set-Content "$Domains\RETURNS_VOIDS_AND_REFUNDS.md" -Encoding utf8

@'
# Approval Workflows

## 1. Purpose

The approval system provides a shared controlled workflow for financially, operationally or security-sensitive actions.

## 2. Approval scope

The MVP must support approvals for:

- purchase requisitions;
- purchase orders;
- supplier receipts;
- stock transfers;
- stock adjustments;
- stocktake variances;
- price overrides;
- discounts;
- voids;
- returns;
- refunds;
- shift variances;
- sensitive role or permission changes.

## 3. Canonical approval lifecycle

```text
DRAFT
→ SUBMITTED
→ PENDING_APPROVAL
→ APPROVED
→ PROCESSING
→ COMPLETED
```

Exception states:

```text
REJECTED
CANCELLED
EXPIRED
FAILED
```

Where multiple approval stages are required:

```text
PENDING_LEVEL_1
→ LEVEL_1_APPROVED
→ PENDING_LEVEL_2
→ APPROVED
```

## 4. Approval request structure

Every approval request must identify:

- approval request ID;
- tenant;
- vendor;
- resource type;
- resource ID;
- requester;
- requester's role;
- request timestamp;
- requested action;
- financial or stock effect;
- reason;
- policy ID;
- policy version;
- resource version;
- eligible approvers;
- required approval count;
- current status;
- expiry;
- correlation ID.

## 5. Policy

Approval policy may consider:

- amount;
- currency;
- quantity;
- value variance;
- resource type;
- product risk;
- branch;
- warehouse;
- requester role;
- approver role;
- time of day;
- offline status;
- repeated behaviour;
- risk severity.

## 6. Authorization

Approval permission must be checked when the decision is made.

UI visibility does not grant approval authority.

The decision service must verify:

- tenant membership;
- active role;
- current permission;
- location scope;
- policy eligibility;
- request version;
- resource version;
- request status;
- segregation-of-duties rule.

## 7. Segregation of duties

When enabled:

- requester cannot approve their own request;
- counter cannot approve their own material stocktake variance;
- cashier cannot approve their own material shift variance;
- receiving actor cannot approve their own high-risk receipt;
- permission change requester cannot self-approve where policy prohibits it.

## 8. Concurrency

Approval decisions require expected request and resource versions.

Stale or duplicate decisions must be rejected.

Two approvers must not independently cause the same downstream transaction to post twice.

## 9. Processing after approval

Approval does not automatically mean the business transaction completed.

The system must distinguish:

- approval decision;
- processing;
- completed business effect;
- failed processing.

Where possible, approval and downstream posting should use a controlled atomic workflow.

## 10. Rejection and cancellation

Rejected or cancelled requests must not create:

- inventory movement;
- sale correction;
- payment movement;
- entitlement activation;
- permission change;
- other material business effect.

## 11. Escalation and expiry

Approval policy may define:

- response deadline;
- escalation recipient;
- reminder interval;
- expiry behaviour;
- reassignment;
- delegated approver.

Escalation does not permit unauthorized approval.

## 12. Required events

- `APPROVAL_REQUEST_CREATED`
- `APPROVAL_REQUEST_SUBMITTED`
- `APPROVAL_REMINDER_SENT`
- `APPROVAL_ESCALATED`
- `APPROVAL_APPROVED`
- `APPROVAL_REJECTED`
- `APPROVAL_CANCELLED`
- `APPROVAL_EXPIRED`
- `APPROVAL_STALE_DECISION_REJECTED`
- `SELF_APPROVAL_BLOCKED`
- `APPROVED_ACTION_PROCESSING`
- `APPROVED_ACTION_COMPLETED`
- `APPROVED_ACTION_FAILED`

## 13. Acceptance criteria

- Unauthorized approver is rejected.
- Cross-tenant approval is rejected.
- Self-approval is rejected where segregation is enabled.
- Stale version is rejected.
- Duplicate decision does not duplicate downstream effect.
- Rejected request creates no material transaction.
- Approval notification reaches only eligible users.
'@ | Set-Content "$Domains\APPROVAL_WORKFLOWS.md" -Encoding utf8

@'
# BI Event Logging

## 1. Core rule

Every meaningful business, financial, inventory, purchasing, operational, approval, security and system transaction must generate an immutable event in the vendor's isolated BI event stream.

The BI system must not record meaningless interface activity.

## 2. Meaningful events

Events must be generated for:

- sales;
- payments;
- refunds;
- returns;
- discounts;
- price overrides;
- purchasing;
- supplier receiving;
- stock movements;
- stocktakes;
- approvals;
- cash movements;
- shifts;
- authentication;
- role and permission changes;
- tenant changes;
- resource licensing;
- blocked transactions;
- failed transactions;
- offline activity;
- synchronization;
- reports containing sensitive information;
- recommendation acceptance or rejection where applicable.

## 3. Prohibited collection

The system must not record:

- mouse movement;
- cursor coordinates;
- ordinary hovering;
- meaningless navigation;
- raw passwords;
- authentication secrets;
- private encryption keys;
- full payment-card data;
- keystroke logs;
- unrelated device activity.

## 4. Event structure

```typescript
type VendorPosBiEvent = {
  eventId: string;
  eventType: string;
  eventVersion: number;

  tenantId: string;
  vendorId: string;

  warehouseId?: string;
  branchId?: string;
  terminalId?: string;
  stockLocationId?: string;

  userId?: string;
  cashierId?: string;
  roleId?: string;
  sessionId?: string;
  shiftId?: string;

  entityType?: string;
  entityId?: string;
  parentEntityId?: string;

  action: string;

  outcome:
    | "STARTED"
    | "COMPLETED"
    | "FAILED"
    | "BLOCKED"
    | "CANCELLED"
    | "REJECTED"
    | "APPROVED";

  reasonCode?: string;
  severity?: "INFO" | "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

  amount?: number;
  currency?: string;
  quantity?: number;

  source:
    | "POS"
    | "PURCHASING"
    | "RECEIVING"
    | "INVENTORY"
    | "STOCKTAKE"
    | "ADMIN"
    | "SYSTEM"
    | "SYNC"
    | "BI";

  occurredAt: string;
  recordedAt: string;

  deviceId?: string;
  applicationVersion?: string;
  offlineEvent: boolean;
  syncedAt?: string;

  correlationId?: string;
  metadata?: Record<string, unknown>;
};
```

## 5. Tenant isolation

Every event must belong to one vendor tenant.

One vendor's detailed events must not be exposed to another vendor.

Cross-vendor intelligence may use only approved, lawful and appropriately anonymized aggregation.

## 6. Event immutability

BI events are append-only.

Users must not directly edit or delete historical events.

Corrections use a new event referencing the original event.

## 7. Event reliability

Business transactions must generate events through a central event service or transactional outbox.

Screens must not invent incompatible logging formats.

Where an event cannot be delivered immediately:

- it must be stored durably;
- retry must be possible;
- duplicate event IDs must be rejected;
- original occurrence time must be preserved.

## 8. Offline events

Offline events must:

- receive unique IDs locally;
- preserve tenant and operational context;
- be encrypted at rest;
- enter the durable synchronization queue;
- preserve original occurrence time;
- synchronize idempotently;
- remain marked as offline-originated.

## 9. BI risk indicators

The MVP may identify explainable indicators including:

- repeated stock variance;
- unusual price override;
- repeated refund;
- high discount;
- repeated void;
- shift shortage;
- repeated failed login;
- stock movement outside normal hours;
- non-PO receipt;
- repeated over-receipt attempt;
- purchase split near approval threshold;
- delayed shift closure;
- failed offline synchronization.

A risk indicator must reference the contributing events.

It must not autonomously punish, suspend or accuse a staff member without an approved human decision workflow.

## 10. Required access controls

- Users may view only permitted tenant and location intelligence.
- Sensitive BI reports require explicit permission.
- Access to sensitive BI information must itself be logged.
- SCI privileged access must be logged.

## 11. Acceptance criteria

- Meaningful business transactions generate canonical events.
- Mouse movement and meaningless UI activity do not generate events.
- Cross-tenant BI access is rejected.
- Duplicate offline events do not duplicate records.
- Events cannot be edited by ordinary users.
- Risk scores identify contributing events.
'@ | Set-Content "$Domains\BI_EVENT_LOGGING.md" -Encoding utf8

@'
# Notifications

## 1. Purpose

Notifications inform authorized users about actions, exceptions, risks and operational status.

Notifications must be driven by domain events and policies, not scattered screen-specific code.

## 2. Notification model

The system must distinguish:

1. Domain event.
2. Notification rule.
3. Notification record.
4. Delivery attempt.
5. User acknowledgement.

## 3. Notification categories

- ACTION_REQUIRED
- WARNING
- FAILURE
- SECURITY
- INFORMATION
- REMINDER

## 4. Notification severity

- INFO
- LOW
- MEDIUM
- HIGH
- CRITICAL

## 5. Notification record

Every notification must identify:

- notification ID;
- tenant;
- vendor;
- recipient user or role;
- warehouse, branch or terminal context where applicable;
- category;
- severity;
- title;
- message;
- source event type;
- source event ID;
- entity type;
- entity ID;
- action link or route where applicable;
- created time;
- expiry;
- read status;
- acknowledgement status;
- escalation status;
- deduplication key.

## 6. Required notification triggers

### Approvals

- approval required;
- approval reminder;
- approval escalation;
- request approved;
- request rejected;
- approved action failed.

### Purchasing and receiving

- purchase order approved;
- purchase order issued;
- delivery overdue;
- purchase partially received;
- over-receipt blocked;
- receiving approval required;
- damaged or rejected delivery;
- receipt posting failed.

### Inventory and stocktake

- low stock;
- out of stock;
- transfer dispatched;
- transfer overdue;
- transfer discrepancy;
- stocktake assigned;
- stocktake overdue;
- recount required;
- material variance;
- adjustment approval required;
- adjustment posting failed.

### Sales and shifts

- discount approval required;
- price override approval required;
- failed checkout;
- offline sale sync failure;
- refund approval required;
- suspicious repeated refund;
- shift variance;
- delayed shift closure.

### Tenancy and security

- demo expiry approaching;
- demo expired;
- resource licence required;
- verification status changed;
- failed login threshold;
- privileged access;
- role or permission changed;
- tenant suspended.

## 7. Recipient resolution

Recipients must be resolved by:

- tenant;
- role;
- permission;
- location assignment;
- resource ownership;
- approval eligibility;
- escalation policy.

Notifications must not be sent to unauthorized roles merely because they can see the same menu.

## 8. Deduplication

Repeated identical events must not create notification flooding.

Notification rules may group by:

- source event;
- entity;
- recipient;
- time window;
- severity;
- deduplication key.

Critical new information must not be hidden by deduplication.

## 9. Read and acknowledgement

The system must distinguish:

- delivered;
- read;
- acknowledged;
- acted upon;
- expired.

Reading a notification does not imply the underlying business action was completed.

## 10. Escalation

Escalation policies may define:

- response deadline;
- reminder interval;
- next-level recipient;
- maximum escalation level;
- expiry behaviour.

## 11. Delivery channels

Initial MVP channel:

- in-app notification desk.

Future approved channels may include:

- email;
- push notification;
- SMS;
- WhatsApp.

Delivery failure must not erase the notification record.

## 12. Acceptance criteria

- Only authorized recipients receive tenant notifications.
- Duplicate events do not flood recipients.
- Read and acknowledgement states remain distinct.
- Approval notification does not itself approve the request.
- Expired notifications do not erase historical events.
- Cross-tenant notification delivery is rejected.
'@ | Set-Content "$Domains\NOTIFICATIONS.md" -Encoding utf8

@'
# Reporting

## 1. Principle

Reports derive from authoritative transactions, ledgers and events.

Reports must not mutate operational records.

## 2. Report contract

Every report must define:

- report name;
- business purpose;
- authoritative source records;
- filters;
- grouping;
- calculations;
- permission;
- tenant scope;
- location scope;
- timezone;
- currency treatment;
- export formats;
- reconciliation rule;
- freshness or generation time.

## 3. Sales reports

Required reports:

- daily sales summary;
- sales by branch;
- sales by terminal;
- sales by cashier;
- sales by product;
- sales by category;
- payment-method totals;
- discount report;
- price override report;
- void report;
- refund report;
- offline sale report;
- gross profit report where cost data is authorized.

## 4. Shift and cash reports

Required reports:

- open shifts;
- closed shifts;
- shift sales;
- opening float;
- cash movements;
- expected cash;
- counted cash;
- cash variance;
- payment reconciliation;
- delayed shift closure;
- supervisor intervention.

## 5. Inventory reports

Required reports:

- stock on hand;
- available stock;
- reserved stock;
- in-transit stock;
- damaged stock;
- quarantined stock;
- inventory valuation;
- stock movement ledger;
- low stock;
- out of stock;
- inventory adjustment;
- negative-stock attempt;
- product movement history.

## 6. Purchasing reports

Required reports:

- purchase requisitions;
- purchase orders;
- open purchase orders;
- partially received purchase orders;
- overdue purchase orders;
- purchase value by supplier;
- purchase price variance;
- cancelled purchase orders;
- approval turnaround.

## 7. Receiving reports

Required reports:

- supplier receipts;
- receipts by warehouse;
- receipts by supplier;
- accepted quantities;
- damaged quantities;
- rejected quantities;
- non-PO receipts;
- over-receipt attempts;
- receipt reversals;
- receiving actor activity.

## 8. Stocktake reports

Required reports:

- stocktake progress;
- overdue counts;
- first-count variance;
- recount variance;
- approved variance;
- variance by product;
- variance by category;
- variance by location;
- variance by counter;
- recurring variance;
- stocktake adjustment value;
- unresolved disputes.

## 9. BI and control reports

Required reports:

- events by severity;
- blocked transactions;
- failed transactions;
- repeated refunds;
- repeated voids;
- price overrides;
- shift shortages;
- repeated stock variance;
- failed login activity;
- privileged actions;
- offline activity;
- synchronization failure;
- approval bottlenecks.

## 10. Tenant and permissions

Every report query must enforce:

- tenant isolation;
- role permission;
- assigned location scope;
- allowed date range where policy applies;
- sensitive field masking.

A client-provided vendor ID must not independently grant report access.

## 11. Timezone

Operational reports must clearly state the timezone used.

Date grouping must be based on the approved vendor or branch business timezone, not an unlabelled browser timezone.

## 12. Currency

Reports must not silently combine currencies.

Where currency conversion is supported, the report must state:

- original currency;
- converted currency;
- exchange rate;
- rate source;
- rate date.

## 13. Reconciliation

Reports must reconcile to source records.

Examples:

- sales total reconciles to completed sale records;
- payment total reconciles to accepted payments;
- shift total reconciles to shift transactions;
- stock balance reconciles to ledger;
- stocktake adjustment reconciles to posted adjustment movements;
- purchase outstanding quantity reconciles to ordered less accepted receipts.

## 14. Export

Approved export formats may include:

- CSV;
- XLSX;
- PDF;
- printable view.

Export must preserve tenant and permission controls.

Sensitive report export must generate an audit and BI event.

## 15. Acceptance criteria

- Cross-tenant reporting is rejected.
- Report totals reconcile to source records.
- Timezone and currency are visible.
- Report queries do not mutate business records.
- Sensitive exports are logged.
- Suspended locations retain historical reporting.
'@ | Set-Content "$Domains\REPORTING.md" -Encoding utf8

@'
# State Machines

This contract defines canonical states. Domain SOT documents define detailed authorization and transition requirements.

## Vendor

```text
DRAFT
→ SUBMITTED
→ DEMO_ACTIVE
→ VERIFICATION_PENDING
→ VERIFIED
→ ACTIVE
```

Exceptions:

```text
REJECTED
DEMO_EXPIRED
SUSPENDED
CANCELLED
ARCHIVED
```

## Purchase requisition

```text
DRAFT
→ SUBMITTED
→ PENDING_APPROVAL
→ APPROVED
→ CONVERTED_TO_PO
```

Exceptions:

```text
REJECTED
CANCELLED
EXPIRED
```

## Purchase order

```text
DRAFT
→ PENDING_APPROVAL
→ APPROVED
→ ISSUED
→ PARTIALLY_RECEIVED
→ FULLY_RECEIVED
→ CLOSED
```

Exceptions:

```text
REJECTED
CANCELLED
EXPIRED
DISPUTED
```

## Supplier receipt

```text
DRAFT
→ SUBMITTED
→ PENDING_APPROVAL
→ APPROVED
→ PROCESSING
→ POSTED
```

Exceptions:

```text
REJECTED
CANCELLED
FAILED
REVERSED
```

## Stock transfer

```text
DRAFT
→ SUBMITTED
→ PENDING_APPROVAL
→ APPROVED
→ DISPATCHING
→ DISPATCHED
→ IN_TRANSIT
→ RECEIVING
→ RECEIVED
→ COMPLETED
```

Exceptions:

```text
REJECTED
CANCELLED
DISPUTED
FAILED
REVERSED
```

## Stocktake

```text
PLANNED
→ ASSIGNED
→ IN_PROGRESS
→ COUNT_SUBMITTED
→ PENDING_REVIEW
→ PENDING_APPROVAL
→ APPROVED
→ ADJUSTMENT_POSTING
→ ADJUSTMENT_POSTED
→ CLOSED
```

Recount path:

```text
PENDING_REVIEW
→ RECOUNT_REQUIRED
→ RECOUNT_ASSIGNED
→ RECOUNT_IN_PROGRESS
→ RECOUNT_SUBMITTED
→ PENDING_APPROVAL
```

Exceptions:

```text
CANCELLED
REJECTED
DISPUTED
FAILED
```

## Shift

```text
SCHEDULED
→ OPEN
→ CLOSING
→ CLOSED
```

Exceptions:

```text
SUSPENDED
REOPEN_PENDING_APPROVAL
REOPENED
CANCELLED
FAILED
```

## Sale

```text
ACTIVE
→ PAYMENT_PENDING
→ POSTING
→ COMPLETED
→ RECEIPTED
```

Offline:

```text
ACTIVE
→ OFFLINE_VALIDATED
→ COMPLETED_PENDING_SYNC
→ SYNCING
→ SYNCHRONIZED
```

Exceptions:

```text
ABANDONED
CANCELLED
FAILED
BLOCKED
SYNC_FAILED
SYNC_REJECTED
RECONCILIATION_REQUIRED
VOIDED
PARTIALLY_REFUNDED
FULLY_REFUNDED
```

## Approval

```text
DRAFT
→ SUBMITTED
→ PENDING_APPROVAL
→ APPROVED
→ PROCESSING
→ COMPLETED
```

Exceptions:

```text
REJECTED
CANCELLED
EXPIRED
FAILED
```
'@ | Set-Content "$Contracts\STATE_MACHINES.md" -Encoding utf8

@'
# Acceptance Test Matrix

Use this document to track implementation and evidence.

| ID | Requirement | Governing SOT | Implementation | Unit | Integration | Emulator | E2E | Status |
|---|---|---|---|---|---|---|---|---|
| TEN-001 | Tenant isolation | TENANCY_AND_ONBOARDING | TBD | TBD | TBD | Required | Required | Open |
| TEN-002 | Idempotent default provisioning | TENANCY_AND_ONBOARDING | TBD | Required | Required | Required | Required | Open |
| ORG-001 | Warehouse cannot host terminal | ORGANISATION_STRUCTURE | TBD | Required | Required | Required | Required | Open |
| ORG-002 | Branch cannot receive supplier stock | SUPPLIER_RECEIVING | TBD | Required | Required | Required | Required | Open |
| PUR-001 | Purchase order creates no stock | PURCHASING | TBD | Required | Required | Optional | Required | Open |
| REC-001 | Accepted receipt posts warehouse stock once | SUPPLIER_RECEIVING | TBD | Required | Required | Required | Required | Open |
| INV-001 | Balance reconciles to ledger | INVENTORY_LEDGER | TBD | Required | Required | Required | Required | Open |
| INV-002 | Duplicate stock command is idempotent | INVENTORY_LEDGER | TBD | Required | Required | Required | Required | Open |
| STK-001 | Blind count hides expected quantity | STOCKTAKE_AND_ADJUSTMENTS | TBD | Required | Required | Optional | Required | Open |
| STK-002 | Count alone does not modify stock | STOCKTAKE_AND_ADJUSTMENTS | TBD | Required | Required | Required | Required | Open |
| STK-003 | Approved adjustment posts once | STOCKTAKE_AND_ADJUSTMENTS | TBD | Required | Required | Required | Required | Open |
| SHF-001 | Sale requires open shift | SHIFT_AND_CASH_CONTROL | TBD | Required | Required | Required | Required | Open |
| SHF-002 | Expected cash reconciles | SHIFT_AND_CASH_CONTROL | TBD | Required | Required | Optional | Required | Open |
| SAL-001 | Sale uses branch stock only | SALES_AND_CHECKOUT | TBD | Required | Required | Required | Required | Open |
| SAL-002 | Sale and stock deduction are atomic | SALES_AND_CHECKOUT | TBD | Required | Required | Required | Required | Open |
| SAL-003 | Duplicate checkout does not duplicate sale | SALES_AND_CHECKOUT | TBD | Required | Required | Required | Required | Open |
| OFF-001 | Offline sale remains pending sync | SALES_AND_CHECKOUT | TBD | Required | Required | Optional | Required | Open |
| APP-001 | Unauthorized approval rejected | APPROVAL_WORKFLOWS | TBD | Required | Required | Required | Required | Open |
| APP-002 | Self-approval blocked where configured | APPROVAL_WORKFLOWS | TBD | Required | Required | Required | Required | Open |
| BI-001 | Meaningful actions create immutable events | BI_EVENT_LOGGING | TBD | Required | Required | Required | Required | Open |
| BI-002 | Cross-tenant BI access rejected | BI_EVENT_LOGGING | TBD | Required | Required | Required | Required | Open |
| NOT-001 | Notifications target authorized recipients | NOTIFICATIONS | TBD | Required | Required | Required | Required | Open |
| REP-001 | Report totals reconcile | REPORTING | TBD | Required | Required | Optional | Required | Open |
| REP-002 | Cross-tenant report rejected | REPORTING | TBD | Required | Required | Required | Required | Open |

## Status values

- Open
- In Progress
- Partial
- Blocked
- Verified
- Deferred

No requirement should be marked Verified without linked implementation and test evidence.
'@ | Set-Content "$Contracts\ACCEPTANCE_TEST_MATRIX.md" -Encoding utf8

Write-Host ""
Write-Host "Phase 3 file sizes:" -ForegroundColor Cyan

Get-Item `
  "$Domains\STOCKTAKE_AND_ADJUSTMENTS.md", `
  "$Domains\SHIFT_AND_CASH_CONTROL.md", `
  "$Domains\SALES_AND_CHECKOUT.md", `
  "$Domains\PAYMENTS_AND_RECEIPTS.md", `
  "$Domains\RETURNS_VOIDS_AND_REFUNDS.md", `
  "$Domains\APPROVAL_WORKFLOWS.md", `
  "$Domains\BI_EVENT_LOGGING.md", `
  "$Domains\NOTIFICATIONS.md", `
  "$Domains\REPORTING.md", `
  "$Contracts\STATE_MACHINES.md", `
  "$Contracts\ACCEPTANCE_TEST_MATRIX.md" |
    Select-Object Name, Length

Write-Host ""
Write-Host "Running SOT validation..." -ForegroundColor Cyan

powershell -ExecutionPolicy Bypass -File scripts\validate-sot.ps1

Write-Host ""
Write-Host "Git changes:" -ForegroundColor Cyan

git status --short
git diff --stat
