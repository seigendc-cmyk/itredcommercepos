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
| INV-001 | Balance reconciles to ledger | INVENTORY_LEDGER | Client balance writes denied by `firestore.rules`; posting migration remains open | Required | Required | `tests/firestore.rules.test.ts` (boundary pass) | Required | Partial |
| INV-002 | Duplicate stock command is idempotent | INVENTORY_LEDGER | TBD | Required | Required | Required | Required | Open |
| STK-001 | Blind count hides expected quantity | STOCKTAKE_AND_ADJUSTMENTS | TBD | Required | Required | Optional | Required | Open |
| STK-002 | Count alone does not modify stock | STOCKTAKE_AND_ADJUSTMENTS | TBD | Required | Required | Required | Required | Open |
| STK-003 | Approved adjustment posts once | STOCKTAKE_AND_ADJUSTMENTS | TBD | Required | Required | Required | Required | Open |
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
