# Canonical Product and Stock Actions QA Evidence

Date: 2026-08-02

Branch: `fix/canonical-product-import-ui-wiring`

Baseline: `4394454`

## Automated evidence

- Product form controls and edit-only quantity restriction are rendered in `productUi.test.tsx`.
- Canonical field order, sector maps, HS normalization, tenant tax-rate behavior, ranked order-independent search, explicit sorting, scoped column preferences, duplicate decisions and canonical ledger references are covered in `products.test.ts`.
- Import schema, exact and possible duplicate review, explicit mapping, and opening-balance request isolation are covered in `productImport.test.ts`.
- Incident deduplication/evidence escalation, permissions, authorised closure and live-movement targeted-count reconciliation are covered in `stockAssurance.test.ts`.
- Existing stocktake and approval tests continue to cover selected-day scoping, draft isolation, approval idempotency, atomic posting and rejection without inventory effects.

No credentials, production data or customer data were used.

## Authenticated browser QA

Not executed in this coding environment because no interactive/authenticated browser capability is available. The 31-step authenticated workflow in the implementation request remains a release-gate check on staging; it must not be represented as passed based on server-render or unit tests alone.
