# SQLite Controlled Checkout Schema

Schema version 3 adds:

- operational sale statuses including `COMPLETED_PENDING_SYNC`;
- transaction and idempotency identifiers;
- occurrence and synchronization timestamps;
- cashier, device, shift and stock-location context;
- cached subscription, branch-licence and terminal-licence state with validity bounds;
- device enrolment and wrapped-key metadata;
- payment verification modes;
- offline receipt status;
- separate fiscalisation records;
- enriched append-only BI/audit context;
- encrypted offline outbox records;
- correction transactions;
- immutability triggers for completed offline sales.

Earlier foundation tables and migrations remain forward-migrated and tested. All operational records are scoped by tenant, vendor, branch and terminal where applicable.
