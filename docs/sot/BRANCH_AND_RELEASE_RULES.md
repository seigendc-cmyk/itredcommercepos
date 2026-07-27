# Branch and Release Rules

Status: Approved engineering controls
Version: 1.0
Owner: iTred Commerce Engineering
Last updated: 27 July 2026

## Branch discipline

- Feature work uses a dedicated, clearly named branch.
- Protected primary branches do not receive direct development commits.
- Preserve unrelated and uncommitted work.
- Keep commits bounded by capability.
- Do not rewrite shared history or run destructive Git commands without explicit approval.
- Commit, push, merge, deploy and force-push require explicit instruction.
- Build output, caches, `.env` files, credentials and local databases are never committed.

## Change controls

- Do not combine unrelated capabilities merely for convenience.
- Do not rebuild an existing service for style.
- Do not introduce mock operational data or fabricated success.
- Schema changes require forward migrations, applicable rules and tests.
- UI visibility never replaces service or data-rule enforcement.
- Feature flags default to the safest approved state.

## Validation gate

Before review:

```text
npm test
npm run lint
npm run build
git diff --check
```

Also inspect route behaviour, browser errors where tooling exists, missing imports, permission and entitlement bypasses, tenant isolation, hard-coded IDs, placeholder data, accessibility and responsive overflow.

Failed validation blocks release unless an authorised exception records the failure, impact, owner and expiry.

## Release gate

A release must identify its exact commit and environment, include required rules/indexes/migrations, document flags and known gaps, preserve authentication and atomic transaction behaviour, and avoid unsupported compliance claims.

Deployment requires separate explicit authorisation. A Git push is not deployment approval.

Rollback must not erase completed sales, inventory movements, audit events or statutory history. Transaction-risk defects should be contained by safely disabling the affected feature while preserving records.
