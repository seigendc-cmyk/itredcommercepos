# Definition of Done

A feature is not complete merely because a screen exists or the application builds.

## Required evidence

### Functional

- Acceptance criteria are satisfied.
- Happy path is tested.
- Failure paths are tested.
- Permission failures are tested.
- State transitions are tested.

### Data integrity

- Tenant scope is enforced.
- Location scope is enforced.
- Idempotency is implemented where required.
- Audit and BI events are generated.
- No silent destructive update is introduced.

### Engineering

- TypeScript validation passes.
- Unit tests pass.
- Integration tests pass where applicable.
- Firestore emulator tests pass where applicable.
- Production build passes.

### User experience

- Loading state exists.
- Empty state exists.
- Error state exists.
- Permission-denied state exists.
- Offline state exists where applicable.
- Mobile operation is usable.

### Operations

- Migration impact is documented.
- Rollback approach is documented.
- Environment changes are documented.
- Monitoring or meaningful failure logging exists.
- SOT is updated where permanent behaviour changed.

## Agent completion report

Every agent completion report must state:

- files changed;
- SOT documents applied;
- tests added or changed;
- commands executed;
- results;
- remaining risks;
- deferred items.
