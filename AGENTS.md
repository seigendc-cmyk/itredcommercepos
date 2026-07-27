# iTred Commerce POS Agent Instructions

Status: Active repository instructions
Version: 1.0
Owner: iTred Commerce Engineering
Last updated: 27 July 2026

These instructions apply across the repository. They govern how agents work but never override an approved source-of-truth document in `docs/sot`.

## Before coding

- Read `docs/sot/README.md`, `docs/sot/MVP_SCOPE.md`, and every SOT applicable to the requested capability.
- Inspect existing handlers, services, security controls, routes, permissions, entitlements and tests before introducing code.
- Stop and report any conflict between code, requested behaviour and an approved SOT.
- Do not assume that a missing service, route or persistence model exists.

## Implementation conduct

- Preserve existing business handlers and services unless the task explicitly authorises behavioural changes.
- Reuse existing services and shared UI components.
- Preserve tenant, vendor, branch, warehouse and terminal isolation.
- Preserve branch-terminal consistency, atomic checkout and inventory integrity.
- Never use warehouse stock as saleable POS stock.
- Do not add mock production data, placeholder operational records or simulated transaction success.
- Do not report success until the authoritative service confirms it.
- Keep permission and entitlement enforcement outside UI visibility checks.
- Add or update focused tests for changed behaviour.
- Follow `docs/sot/UI_UX_DESIGN_SYSTEM.md`; do not introduce a second UI framework.

## Security

- Never commit or log passwords, PINs, access codes, tokens, card data, encryption keys or credentials.
- Never hard-code tenant, vendor, branch, warehouse or terminal IDs.
- Never weaken authentication, Firestore rules or service checks to make a UI flow work.
- Completed sales, payments, inventory movements and statutory records remain immutable.

## Git and external state

- Preserve unrelated working-tree changes.
- Never run destructive Git commands such as `git reset --hard` or `git clean -fd` without explicit user approval.
- Never commit, push, merge, deploy or force-push unless explicitly instructed.
- Do not rewrite shared history.
- Do not add build output, local caches, `.env` files or local databases.

## Validation and handoff

Run, as applicable:

```text
npm test
npm run lint
npm run build
git diff --check
```

Before handoff, inspect for missing imports, route errors, permission or entitlement bypasses, inaccessible controls, responsive overflow, placeholder data, hard-coded IDs and secrets.

Report:

- every created and modified file;
- tests and builds executed;
- affected SOT rules;
- unresolved dependencies and SOT conflicts;
- whether business behaviour or production data changed.
