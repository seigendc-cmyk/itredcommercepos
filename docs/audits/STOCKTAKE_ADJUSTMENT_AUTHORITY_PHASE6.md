# Stocktake Adjustment Authority — Phase 6

Phase 6 introduces authenticated callable commands for creation, opening, immutable count evidence, submission, approval/rejection, canonical adjustment posting, closure and cancellation.

Count evidence retains occurrence time, device/offline identity, revision, authoritative system snapshot/version and server-calculated variance. Blind responses redact system values. Posting uses the existing `InventoryPostingEngine`; snapshot drift blocks posting and requires reconciliation or recount. Commands, movements and audit/BI events use stable identities.

Firestore rules deny browser mutation of stocktakes, evidence, command records, balances, movements and trusted completion events.

Completed authority evidence:

- full and partial compensating reversal through `InventoryPostingEngine`, with remaining-quantity enforcement and immutable reversal history;
- typed browser callable adapter and migration of the active scheduled-stocktake workflow away from authoritative browser persistence;
- 30 Auth + Functions + Firestore emulator cases covering authority, idempotency, concurrency, rollback, reversal, rules and exactly-once events;
- extended Firestore rules denial for stocktakes, evidence, command receipts, movements, balances and trusted events;
- inventory write audit result: 0 prohibited browser writers.

Remaining MVP work outside this authority phase includes notification delivery and configurable value/risk approval thresholds.

No deployment or merge to `main` is authorized by this phase.
