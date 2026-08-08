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
â†’ ASSIGNED
â†’ IN_PROGRESS
â†’ COUNT_SUBMITTED
â†’ PENDING_REVIEW
```

Where no recount is required:

```text
PENDING_REVIEW
â†’ PENDING_APPROVAL
â†’ APPROVED
â†’ ADJUSTMENT_POSTING
â†’ ADJUSTMENT_POSTED
â†’ CLOSED
```

Where a recount is required:

```text
PENDING_REVIEW
â†’ RECOUNT_REQUIRED
â†’ RECOUNT_ASSIGNED
â†’ RECOUNT_IN_PROGRESS
â†’ RECOUNT_SUBMITTED
â†’ PENDING_APPROVAL
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

## 17. Authoritative persistence contract

Stocktake lifecycle, count evidence, approval and adjustment posting are server-owned Firebase callable commands. Browser writes to stocktakes, evidence, commands, balances, movements and trusted events are denied.

Each count submission creates immutable evidence. Recounts create a new globally unique evidence record and revision; prior evidence is never overwritten. The server snapshots canonical on-hand quantity and balance version and calculates `varianceQuantity = countedQuantity - systemQuantitySnapshot`. Blind counters receive no snapshot or variance in the command response.

Posting fails closed if the canonical balance quantity or version differs from the evidence snapshot. This implements the approved movement-tracking policy: intervening movements require reconciliation or recount. Zero variance creates no movement. Non-zero approved variance posts through `InventoryPostingEngine` as a directional `STOCKTAKE_ADJUSTMENT` and cannot produce invalid inventory.

## 18. Compensating reversal

Posted stocktake adjustments are corrected only by the trusted `reverseStocktakeAdjustment` command. Original count evidence, approval, variance and movements remain immutable. Each reversal requires a reason and posts a new opposite-direction `STOCKTAKE_ADJUSTMENT` through `InventoryPostingEngine`, linked by `reversalOfMovementId`.

The server tracks cumulative reversed and remaining quantities per original movement. A command may reverse all remaining quantities or explicit partial quantities, but cannot exceed remaining authority. Partial correction sets `PARTIALLY_REVERSED`; exhausting every original movement sets `REVERSED`. Stable command receipts make replay idempotent, and each successful command emits immutable audit and BI events atomically with movements, balances and stocktake metadata.
