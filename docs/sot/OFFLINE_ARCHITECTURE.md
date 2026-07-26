# Controlled Offline Checkout Architecture

```text
POS request
  -> enrolled device/key check
  -> SQLite BEGIN IMMEDIATE
  -> terminal + branch + entitlement validation
  -> cashier + shift validation
  -> branch price/tax/stock validation
  -> sale + item/payment snapshots
  -> guarded branch stock deduction
  -> movements + receipt + fiscal pending
  -> audit + BI events
  -> encrypted outbox + local queue
  -> COMMIT
  -> encrypted SQLite export to OPFS/IndexedDB
```

Any validation or write failure rolls back the sale transaction. A separate best-effort blocked/failed BI event may be recorded after rollback. Server synchronization acceptance is deliberately absent.

Operational states exposed to the UI are `ONLINE`, `OFFLINE`, `SYNCING`, `SYNC ERROR`, `FISCALISATION PENDING`, `CONFIGURATION OUTDATED` and `TERMINAL SUSPENDED`.
