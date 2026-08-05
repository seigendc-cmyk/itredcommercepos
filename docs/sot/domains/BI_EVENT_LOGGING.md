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
