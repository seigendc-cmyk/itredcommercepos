# Controlled Offline Checkout Acceptance

Automated acceptance covers:

- complete atomic success;
- rollback after header, item, payment, inventory, receipt, audit, BI or outbox failure;
- guarded branch stock and insufficient-stock rejection;
- warehouse and cross-branch stock rejection;
- duplicate idempotent retry;
- device restart with encrypted database and pending outbox recovery;
- unencrypted persistence rejection;
- missing or revoked device key rejection;
- expired cashier authorization;
- closed shift, suspended terminal, inactive subscription, and unlicensed branch or terminal;
- failed enrolment telemetry without wrapped-key disclosure;
- immutable price and tax snapshots;
- operational-state rendering.

Passing these tests approves the local transaction engine only. Server delivery, acceptance, reconciliation and conflict resolution require a separate SOT.
