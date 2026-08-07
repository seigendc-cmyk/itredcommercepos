# Acceptance Test Matrix

Use this document to track implementation and evidence.

| ID | Requirement | Governing SOT | Implementation | Unit | Integration | Emulator | E2E | Status |
|---|---|---|---|---|---|---|---|---|
| TEN-001 | Tenant isolation | TENANCY_AND_ONBOARDING | `firestore.rules`; `src/auth/tenantMembership.ts` | Required | Required | `tests/firestore.rules.test.ts` (pass) | Required | Partial |
| TEN-002 | Idempotent default provisioning | TENANCY_AND_ONBOARDING | TBD | Required | Required | Required | Required | Open |
| ORG-001 | Warehouse cannot host terminal | ORGANISATION_STRUCTURE | TBD | Required | Required | Required | Required | Open |
| ORG-002 | Branch cannot receive supplier stock | SUPPLIER_RECEIVING | TBD | Required | Required | Required | Required | Open |
| PUR-001 | Purchase order creates no stock | PURCHASING | TBD | Required | Required | Optional | Required | Open |
| REC-001 | Accepted receipt posts warehouse stock once | SUPPLIER_RECEIVING | TBD | Required | Required | Required | Required | Open |
| INV-001 | Balance reconciles to ledger | INVENTORY_LEDGER | `inventoryReconciliation.test.ts` detects seeded divergence without mutation; direct-write audit confines persistence to canonical adapters | `inventoryReconciliation.test.ts` | `inventoryCore.test.ts`, `inventoryReconciliation.test.ts` | `tests/firestore.rules.test.ts` | Required | Partial |
| INV-002 | Duplicate stock command is idempotent | INVENTORY_LEDGER | Engine and transfer receipt replay tests prove one movement and one balance effect | `inventoryCore.test.ts` | `inventoryReconciliation.test.ts`, sale and supplier posting tests | `tests/firestore.rules.test.ts` | Required | Partial |
| TRF-001 | Dispatch is atomic, idempotent, and creates explicit in-transit stock | STOCK_TRANSFERS | Trusted callable transaction | `functions/src/transferCommands.test.ts` | Callable emulator coverage required | Direct transfer/balance/movement writes denied | Functions build | Partial |
| TRF-002 | Partial receipt consumes in-transit and cannot over-receive | STOCK_TRANSFERS | Trusted callable transaction | `functions/src/transferCommands.test.ts` | Callable emulator coverage required | Direct writes denied | Functions build | Partial |
| TRF-003 | Discrepancy and reversal remain traceable | STOCK_TRANSFERS | Append-only discrepancy and compensating movement commands | `functions/src/transferCommands.test.ts` | Callable emulator coverage required | Movement update/delete denied | Functions build | Partial |
| TRF-004 | Branch-to-branch requires destination confirmation | STOCK_TRANSFERS | Approval creates staged `APPROVED` record | Required | Callable emulator coverage required | Direct transfer updates denied | Functions build | Partial |
| STK-001 | Blind count hides expected quantity | STOCKTAKE_AND_ADJUSTMENTS | TBD | Required | Required | Optional | Required | Open |
| STK-002 | Count alone does not modify stock | STOCKTAKE_AND_ADJUSTMENTS | Stocktake draft/count tests remain separate from inventory posting; approval handler is the only posting path | `stocktake.test.tsx` | `inventoryReconciliation.test.ts` | Phase 1 balance-write denial | Required | Partial |
| STK-003 | Approved adjustment posts once | STOCKTAKE_AND_ADJUSTMENTS | Approved handler supplies deterministic request/item key to canonical engine; duplicate engine posting is a no-op | `inventoryCore.test.ts` | `inventoryReconciliation.test.ts` | Phase 1 movement immutability tests | Required | Partial |
| SHF-001 | Sale requires open shift | SHIFT_AND_CASH_CONTROL | TBD | Required | Required | Required | Required | Open |
| SHF-002 | Expected cash reconciles | SHIFT_AND_CASH_CONTROL | TBD | Required | Required | Optional | Required | Open |
| SAL-001 | Sale uses branch stock only | SALES_AND_CHECKOUT | TBD | Required | Required | Required | Required | Open |
| SAL-002 | Sale and stock deduction are atomic | SALES_AND_CHECKOUT | TBD | Required | Required | Required | Required | Open |
| SAL-003 | Duplicate checkout does not duplicate sale | SALES_AND_CHECKOUT | TBD | Required | Required | Required | Required | Open |
| OFF-001 | Offline sale remains pending sync | SALES_AND_CHECKOUT | TBD | Required | Required | Optional | Required | Open |
| APP-001 | Unauthorized approval rejected | APPROVAL_WORKFLOWS | TBD | Required | Required | Required | Required | Open |
| APP-002 | Self-approval blocked where configured | APPROVAL_WORKFLOWS | TBD | Required | Required | Required | Required | Open |
| BI-001 | Meaningful actions create immutable events | BI_EVENT_LOGGING | BI/audit updates and deletes denied by `firestore.rules`; canonical event coverage remains open | Required | Required | `tests/firestore.rules.test.ts` (immutability pass) | Required | Partial |
| BI-002 | Cross-tenant BI access rejected | BI_EVENT_LOGGING | `firestore.rules` membership and location boundary | Required | Required | `tests/firestore.rules.test.ts` (pass) | Required | Partial |
| NOT-001 | Notifications target authorized recipients | NOTIFICATIONS | TBD | Required | Required | Required | Required | Open |
| REP-001 | Report totals reconcile | REPORTING | TBD | Required | Required | Optional | Required | Open |
| REP-002 | Cross-tenant report rejected | REPORTING | TBD | Required | Required | Required | Required | Open |

## Status values

- Open
- In Progress
- Partial
- Blocked
- Verified
- Deferred

No requirement should be marked Verified without linked implementation and test evidence.
