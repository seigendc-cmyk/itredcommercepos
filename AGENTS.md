# iTredPOS Agent Instructions

The authoritative repository rules are stored under `docs/sot/`.

Before modifying code, every coding agent must read:

1. `docs/sot/README.md`
2. `docs/sot/MVP_SCOPE.md`
3. The SOT document governing the affected feature

## Current priority

The current priority is delivery of a stable MVP.

Work must focus on:

- Firebase Google authentication
- product and inventory integrity
- branch-scoped cart behaviour
- reliable checkout
- shift control
- receipt generation
- basic sales history

Do not add new engines, advanced modules or infrastructure unless required by
the approved MVP scope.

## Git workflow

- `main` is production only.
- `staging` is the integrated release candidate.
- Every change starts from `staging`.
- Every change is implemented in a bounded feature branch.
- Feature branches merge into `staging`.
- Only tested release candidates merge from `staging` into `main`.

## Modification rules

- Inspect existing code before creating new abstractions.
- Reuse existing services where practical.
- Do not duplicate cart, inventory, authentication or checkout logic.
- Do not add agent names or generated-by notices.
- Do not silently change business rules.
- Update the relevant SOT when permanent application behaviour changes.
- Run TypeScript validation and production build before reporting completion.
- Never deploy directly to production without explicit authorisation.
