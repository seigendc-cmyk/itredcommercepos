# Transfer Accounting Phase 3 Audit

## Trusted writers

`functions/src/index.ts` owns dispatch, receipt, discrepancy, reversal, and transfer reconciliation commands. Browser clients call these through `src/services/transferCommands.ts`. Firestore rules deny client updates to transfers, transfer command records, inventory balances, and movements.

## Legacy writer deprecation

The former `src/services/db.ts` dispatch and receipt implementations are deprecated and no longer wired to the UI. They must be removed after all consumers have migrated. Direct branch-to-branch posting at approval was removed; approval now creates an `APPROVED` staged transfer requiring dispatch and destination confirmation.

## Migration

Existing `IN_TRANSIT` and `PARTIALLY_RECEIVED` records require a one-time read-only assessment. Lines missing disputed, reversed, or outstanding fields are interpreted as zero/zero/`dispatched - received` by the callable commands. No movement history may be rewritten.

## Rollback

Disable the callable UI actions while retaining all posted movements and balances. Do not restore browser balance writes or instant branch-to-branch posting.
