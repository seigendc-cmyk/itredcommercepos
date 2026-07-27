# MVP Resource Entitlement Rules

- Every vendor receives the resources included in the vendor's active subscription plan.
- The minimum Starter entitlement includes one licensed default warehouse, one licensed default branch, and one licensed default POS terminal assigned to that branch.
- A plan may include higher warehouse, branch, or terminal allowances. An active, unexpired paid resource add-on increases only its declared resource allowance.
- Resource state must track creation, licence status, and lifecycle status separately.
- Licensed suspended resources retain their licence and history but cannot process new operational transactions.
- Archived resources retain their history, cannot process transactions, and do not consume an active licence allowance or active billing unit.
- A POS terminal must belong to an existing active branch. A terminal must never be assigned to a warehouse.
- Creating a branch does not create or license a terminal unless the active plan explicitly defines such a bundled grant.
- Resource creation and reactivation must be checked in the canonical entitlement service. UI-only checks are not sufficient.
- A blocked activation must return an explicit upgrade or add-on requirement and must not create an unlicensed resource.
- Entitlement checks, approved activations, blocked activations, suspensions, and archives must be written to the BI audit log.
- Suspending or archiving a branch also suspends or archives its terminals so they cannot process new sales.
