# Inventory Direct-Write Audit

Date: 2026-08-04

Branch: `integration/inventory-core-engine`

Baseline: `def06cf`

## Result

`npm run audit:inventory` reports 37 contextual findings and 0 prohibited writes:

- 36 `LEGACY_REQUIRES_MIGRATION` findings in `src/services/db.ts`;
- 1 `APPROVED_BOUNDARY_WRITE` finding in the audit test fixture;
- 0 new direct-write files.

The audit reports collection references and associated quantity/write lines separately so reviewers can see both the persistence target and the mutated values. Some findings are contextual reads or preparation lines near an atomic write; they remain reported deliberately to prevent a new write from being hidden behind a pre-built document reference.

## Remaining legacy write families

| Legacy area | Collection target | Representative lines | Classification |
| --- | --- | --- | --- |
| Seed/demo inventory | `warehouse_inventory`, `branch_inventory` | `src/services/db.ts:321`, `:333` | `LEGACY_REQUIRES_MIGRATION` |
| Warehouse transfer dispatch | `warehouse_inventory` | `src/services/db.ts:1401`, `:1431` | `LEGACY_REQUIRES_MIGRATION` |
| Branch transfer receipt | `branch_inventory` | `src/services/db.ts:1544`, `:1565` | `LEGACY_REQUIRES_MIGRATION` |
| Legacy adjustment paths | `branch_inventory` | `src/services/db.ts:1695`, `:1787`, `:1799` | `LEGACY_REQUIRES_MIGRATION` |
| Approved opening-balance posting | `warehouse_inventory` | `src/services/db.ts:2355`, `:2387` | `LEGACY_REQUIRES_MIGRATION` |
| Approved transfer completion | `branch_inventory` | `src/services/db.ts:2432`, `:2445`, `:2476`, `:2484` | `LEGACY_REQUIRES_MIGRATION` |
| Approved supplier receipt | `warehouse_inventory` | `src/services/db.ts:2564`, `:2646`, `:2648` | `LEGACY_REQUIRES_MIGRATION` |
| Approved stock adjustment | dynamic warehouse/branch collection | `src/services/db.ts:2680`, `:2711`, `:2719` | `LEGACY_REQUIRES_MIGRATION` |

## Boundary policy

New direct inventory balance writes fail the audit unless they are located in an inventory infrastructure adapter, inventory test/fixture, or migration directory. `src/services/db.ts` is the only explicitly documented legacy compatibility file. Phase 1 does not migrate or remove its existing Firestore paths.
