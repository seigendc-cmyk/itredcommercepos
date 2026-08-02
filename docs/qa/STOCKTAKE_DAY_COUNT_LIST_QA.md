# Stocktake Working-Day Count List QA Evidence

Date: 2026-08-02

Branch: `fix/canonical-product-import-ui-wiring`

Starting commit: `5288991`

## Automated evidence

- TypeScript validation: passed.
- Repository lint script (`tsc --noEmit`): passed.
- Node test suite: 94/94 passed.
- Production build: passed.
- Static-render UI assertion confirms the sticky header, a single approval CTA, its disabled state, and visible Print Count List and Export Spreadsheet actions.
- Feature tests confirm deterministic day/shelf/product resolution, previous-day exclusion, empty/invalid scope handling, explicit named mapping, location quantity, draft isolation, service permissions, blind PDF columns, XLSX sheets and hidden metadata, CSV scope, and omission of cost/valuation from worksheets.

## Bundle evidence

- Initial application JS: 1,515.73 kB (373.76 kB gzip).
- Lazy ExcelJS chunk: 940.19 kB (271.33 kB gzip).
- Lazy jsPDF chunk: 390.79 kB (128.83 kB gzip).
- Lazy AutoTable chunk: 31.12 kB (9.92 kB gzip).
- The existing Vite warning for chunks larger than 500 kB remains.

## Browser QA status

Authenticated browser QA was not run because the repository has no Playwright, Cypress, or other browser-test harness and no test credentials were supplied. No live tenant or credential data was used. The requested authenticated click-through, generated-file visual inspection, approval-queue observation, screenshots, and desktop/tablet/mobile viewport screenshots remain release QA requirements.
