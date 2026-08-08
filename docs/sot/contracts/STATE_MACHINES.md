# State Machines

This contract defines canonical states. Domain SOT documents define detailed authorization and transition requirements.

## Vendor

```text
DRAFT
â†’ SUBMITTED
â†’ DEMO_ACTIVE
â†’ VERIFICATION_PENDING
â†’ VERIFIED
â†’ ACTIVE
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
â†’ SUBMITTED
â†’ PENDING_APPROVAL
â†’ APPROVED
â†’ CONVERTED_TO_PO
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
â†’ SUBMITTED
â†’ PENDING_APPROVAL
â†’ APPROVED
â†’ ISSUED
â†’ PARTIALLY_RECEIVED
â†’ RECEIVED
â†’ CLOSED
```

Exceptions:

```text
REJECTED
CANCELLED
FAILED
```

## Supplier receipt

```text
DRAFT
â†’ SUBMITTED
â†’ PENDING_APPROVAL
â†’ APPROVED
â†’ PROCESSING
â†’ POSTED
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
â†’ SUBMITTED
â†’ PENDING_APPROVAL
â†’ APPROVED
â†’ DISPATCHING
â†’ DISPATCHED
â†’ IN_TRANSIT
â†’ RECEIVING
â†’ RECEIVED
â†’ COMPLETED
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

The persisted command-state aliases are `DRAFT`, `OPEN`, `COUNTING`, `SUBMITTED`, `PENDING_APPROVAL`, `APPROVED`, `POSTING`, `POSTED`, `PARTIALLY_REVERSED`, `REVERSED`, `CLOSED`, with `REJECTED`, `CANCELLED`, and `FAILED` exceptions. They map to the detailed planning, assignment and recount states below; count revisions preserve recount history rather than mutating evidence.

```text
PLANNED
â†’ ASSIGNED
â†’ IN_PROGRESS
â†’ COUNT_SUBMITTED
â†’ PENDING_REVIEW
â†’ PENDING_APPROVAL
â†’ APPROVED
â†’ ADJUSTMENT_POSTING
â†’ ADJUSTMENT_POSTED
â†’ CLOSED
```

Recount path:

```text
PENDING_REVIEW
â†’ RECOUNT_REQUIRED
â†’ RECOUNT_ASSIGNED
â†’ RECOUNT_IN_PROGRESS
â†’ RECOUNT_SUBMITTED
â†’ PENDING_APPROVAL
```

Exceptions:

```text
CANCELLED
REJECTED
DISPUTED
FAILED
```

Posted adjustment reversal:

```text
POSTED
â†’ PARTIALLY_REVERSED
â†’ REVERSED
```

`POSTED â†’ REVERSED` is permitted when one command consumes all remaining adjustment quantities. Reversal never rewrites original posting or count evidence.

## Shift

```text
SCHEDULED
â†’ OPEN
â†’ CLOSING
â†’ CLOSED
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
â†’ PAYMENT_PENDING
â†’ POSTING
â†’ COMPLETED
â†’ RECEIPTED
```

Offline:

```text
ACTIVE
â†’ OFFLINE_VALIDATED
â†’ COMPLETED_PENDING_SYNC
â†’ SYNCING
â†’ SYNCHRONIZED
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
â†’ SUBMITTED
â†’ PENDING_APPROVAL
â†’ APPROVED
â†’ PROCESSING
â†’ COMPLETED
```

Exceptions:

```text
REJECTED
CANCELLED
EXPIRED
FAILED
```
