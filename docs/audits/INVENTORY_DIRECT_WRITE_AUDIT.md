# Inventory Direct-Write Audit

Date: 2026-08-04

Branch: `integration/inventory-core-engine`

Phase 1 baseline: `def06cf`

Phase 2 starting commit: `191e415`

## Result

`npm run audit:inventory` reports 37 contextual findings and 0 prohibited writes after Phase 2:

- 34 `LEGACY_REQUIRES_MIGRATION` findings in `src/services/db.ts`;
- 2 `APPROVED_CANONICAL_SALE_WRITE` findings in `src/features/inventory/infrastructure/firestoreSaleInventoryAdapter.ts`;
- 1 `APPROVED_BOUNDARY_WRITE` finding in the audit test fixture;
- 0 new direct-write files.

Before Phase 2, sale posting contributed two contextual `LEGACY_REQUIRES_MIGRATION` findings at the former `src/services/db.ts:1787` and `:1799` branch-inventory write boundary. Those sale reads/writes now appear as two approved infrastructure findings in `firestoreSaleInventoryAdapter.ts`; `src/services/saleTransaction.ts` contains no physical inventory write.

The audit reports collection references and associated quantity/write lines separately so reviewers can see both the persistence target and the mutated values. Some findings are contextual reads or preparation lines near an atomic write; they remain reported deliberately to prevent a new write from being hidden behind a pre-built document reference.

## Remaining legacy write families

| Legacy area | Collection target | Representative lines | Classification |
| --- | --- | --- | --- |
| Seed/demo inventory | `warehouse_inventory`, `branch_inventory` | `src/services/db.ts:322`, `:334` | `LEGACY_REQUIRES_MIGRATION` |
| Warehouse transfer dispatch | `warehouse_inventory` | `src/services/db.ts:1402`, `:1432` | `LEGACY_REQUIRES_MIGRATION` |
| Branch transfer receipt | `branch_inventory` | `src/services/db.ts:1545`, `:1566` | `LEGACY_REQUIRES_MIGRATION` |
| Legacy adjustment paths | `branch_inventory` | `src/services/db.ts:1696`, `:1701` | `LEGACY_REQUIRES_MIGRATION` |
| Approved opening-balance posting | `warehouse_inventory` | `src/services/db.ts:2320`, `:2352` | `LEGACY_REQUIRES_MIGRATION` |
| Approved transfer completion | `branch_inventory` | `src/services/db.ts:2397`, `:2410`, `:2441`, `:2449` | `LEGACY_REQUIRES_MIGRATION` |
| Approved supplier receipt | `warehouse_inventory` | `src/services/db.ts:2529`, `:2611`, `:2613` | `LEGACY_REQUIRES_MIGRATION` |
| Approved stock adjustment | dynamic warehouse/branch collection | `src/services/db.ts:2645`, `:2676`, `:2684` | `LEGACY_REQUIRES_MIGRATION` |

## Boundary policy

New direct inventory balance writes fail the audit unless they are located in an inventory infrastructure adapter, inventory test/fixture, or migration directory. `src/services/db.ts` is the only explicitly documented legacy compatibility file. Phase 1 does not migrate or remove its existing Firestore paths.
