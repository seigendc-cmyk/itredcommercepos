# Shift and Cash Control

## 1. Purpose

Shift control links every POS sale and cash movement to an authorized cashier, branch, terminal and operating period.

## 2. Shift lifecycle

```text
SCHEDULED
â†’ OPEN
â†’ CLOSING
â†’ CLOSED
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
Â± approved corrections
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
