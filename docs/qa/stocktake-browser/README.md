# Authenticated Stocktake Browser Acceptance

This directory contains Playwright evidence generated only from the isolated `qa-stocktake-browser-tenant` fixture. It contains no credentials or customer data.

The fixture is development-only and is activated by `?qa=stocktake`. Production builds fail closed to the normal application entry point.

Draft restoration is intentionally device-local because the current approved stocktake draft store uses browser local storage. Cross-device draft synchronization is not claimed.

## Acceptance record

- Date: 2026-08-02
- Browser: Google Chrome 150.0.7871.188 through Playwright 1.62.1
- Viewports: 1440×900 desktop, 820×1000 tablet, and 390×844 mobile
- Roles: authorised warehouse counter, manager, cashier without stocktake access/export, and warehouse user without approval authority
- Result: the Playwright acceptance scenario passed.

Verified behavior:

- Sticky header remains fixed at desktop offset `0` and mobile offset `52px` while the stocktake table is in view. Horizontal table movement does not move header actions, actions wrap on mobile, Approvals Queue stays available, and exactly one submit CTA exists.
- Working Days 1–3 resolve different explicit shelves/products; Working Day 5 displays the empty state. Archived, SERVICE and NON_INVENTORY fixtures never enter the list.
- Save Draft and Continue, Discard Changes, Stay on Current Day and same-device draft reload restoration pass.
- Complete blind, filtered, and permitted system-quantity PDFs were downloaded and opened in Chrome. PDF table structure, repeated header/footer content, count/recount/notes/initial columns, and absence of cost/valuation are also covered by the stocktake unit suite.
- XLSX contains Count List, Instructions, Reference Data, and very-hidden metadata with selected-day scope. CSV order and scope pass. Neither export contains cost or valuation.
- All ten stocktake permissions fail closed for the cashier in direct permission probes. Counter and manager UI controls follow their service permissions.
- Submission produces one deterministic request and retry retains one request. Stock remains unchanged while pending. Manager approval and completion post one movement with before/delta/after reconciliation; a repeated completion does not post again.
- Rejection records the reason and audit transition without changing quantity or adding a movement.
- Contextual BI events contain tenant, actor, cycle, day, location, shelves, product count, outcome, correlation ID and timestamp; PDF/XLSX/CSV events identify their formats.

Chrome's headless built-in PDF viewer exposes and loads each generated PDF but does not rasterize the page body in screenshots; `pdf-output.png` therefore records the viewer surface. The three actual fixture-only PDF files are retained beside it for visual release review without credentials or customer data.
