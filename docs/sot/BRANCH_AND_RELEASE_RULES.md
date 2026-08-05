# Branch and Release Rules

## Branch model

- main is production only.
- staging is the integrated release candidate.
- Work begins from staging.
- Each task uses a bounded feature branch.
- Feature branches merge into staging.
- Only tested release candidates merge from staging into main.

## Required checks

Before merge:

- SOT validation passes.
- TypeScript validation passes.
- Automated tests pass.
- Production build passes.
- Security and emulator tests pass when affected.
- Acceptance evidence is included.

## Deployment

No agent may deploy directly to production without explicit authorization.

Production deployment must have:

- release notes;
- migration instructions;
- rollback instructions;
- known-risk statement;
- validation checklist.
