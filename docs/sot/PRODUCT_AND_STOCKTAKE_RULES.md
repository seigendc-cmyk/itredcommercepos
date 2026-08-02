# MVP Product Import, Lifecycle and Stocktake Rules

- Manual entry, import, product list, POS, receiving, transfer, stocktake, BI, offline snapshots and synchronization use one canonical product schema.
- Product masters contain no global quantity. Quantity is scoped to a warehouse or branch inventory balance.
- Legacy `unit` values remain readable through canonical `unitOfMeasure` normalization; new writes persist the canonical value without discarding the legacy value.
- Only CSV and XLSX product imports are accepted. The application-generated template and its ordered canonical headers are authoritative; nonmatching files are rejected as a whole.
- Import mapping uses canonical header names after schema validation. Positional guessing, header guessing, unrelated aliases and invented product or quantity values are prohibited.
- Fuzzy name similarity is advisory only and never merges products or stock. SKU and barcode duplicates require an explicit decision; ALU duplicates require deliberate review.
- Imported product master data is saved separately from stock. A positive imported inventory quantity creates an idempotent opening-balance approval request and does not directly change inventory.
- Product history is preserved by archiving. Hard deletion is restricted to products with zero stock at every location and no operational references; archive, delete and restore permissions are enforced in the service layer.
- Archived products remain visible in history and are excluded from new sales, receiving, transfer, adjustment and normal stocktake workflows.
- Stocktake uses an explicitly named canonical product-location view model. Object property order, positional cells, `Object.values` and untyped cell arrays are prohibited.
- Normal quantity stocktake contains only active `INVENTORY` products and displays SKU, product name, description, category, size, unit of measure, location, shelf/bin, system quantity, physical quantity and variance.
- Stocktake submission creates a proposed variance in the existing inventory approval workflow. Inventory changes and movement records occur only during atomic approval completion; rejection and cancellation create no movement.
- The 26-working-day cycle resolves through explicit vendor, stock-location, cycle, day, shelf and product assignment fields. Selecting a day changes the authoritative count scope; rendered row position is never an assignment source.
- Only active inventory products with a valid selected-location and shelf assignment appear in a working-day count list. Draft quantities remain separate from inventory and changing day with unsaved counts requires an explicit save, discard or stay decision.
- Count worksheets are scoped to the selected day and location. Blind-count behavior comes from stocktake settings; PDF/XLSX/CSV exports omit cost and valuation by default and never act as inventory adjustment imports.
- Stocktake view, perform, draft, submit, print, export, system-quantity, valuation, review and variance-approval permissions are enforced at service boundaries. The calendar status follows the existing approval request lifecycle.

## Canonical product classification and form

- `hsCode` is an optional normalized string that preserves leading zeros. It is never guessed or stored as a number. `taxOption` is one of `STANDARD_RATED`, `ZERO_RATED`, `EXEMPT`, `NON_TAXABLE` or `OUT_OF_SCOPE`; the effective standard rate comes from the vendor tax configuration, never a product-level country constant.
- Product sector is a controlled `MOTOR_SPARES`, `CLOTHING`, `PHARMACY`, `GROCERIES`, `FURNITURE`, `HARDWARE`, `AGRO_CHEMICALS`, `GENERAL` or `SERVICES` classification. Sector-specific values remain in typed `sectorAttributes`; they are not flattened into inventory balances or inferred only from category wording.
- The authoritative Product Details sequence is Product Type, Industrial Sector, Category, Product Name, SKU, Barcode/EAN, Description, supplier cost, retail price, optional opening quantity, stock location, shelf, bin, unit of measure, size, ALU, HS Code, Tax Option, reorder quantity, primary supplier, relevant brand/manufacturer, sector-specific details and edit-only status. Visual sections may group fields but must preserve this sequence.
- A Product never owns authoritative quantity. A blank or zero new-product quantity has no inventory effect; a positive quantity is inventory-capable only, requires a location, and creates one idempotent opening-balance approval. It never posts stock before approval. Product Details cannot edit quantity after creation or history; later changes use an authorised inventory movement and the Stock Adjustment action.
- Service products never expose or accept quantity, stock location, shelf or bin configuration.

## Catalog query, display and duplicate controls

- Catalog search normalizes punctuation, case and spacing, matches all meaningful tokens across canonical searchable fields in any order, and ranks exact SKU, barcode, ALU and product-name matches ahead of strong cross-field matches. Fuzzy similarity is advisory and cannot be presented as an exact result.
- Catalog sorting reads explicit canonical fields, is stable, supports both directions, and retains search/filter state. Column preferences are tenant-and-user scoped, survive refresh, and cannot hide every product identifier. Description is grouped beneath Product Name and shelf/bin beneath the selected Location by default.
- Manual creation, editing, import and service calls use the same tenant-scoped duplicate detector. Exact SKU and barcode collisions are blocking; high-confidence similarities require deliberate review and an authorised, reasoned separate-product decision. No workflow automatically merges product masters, inventory or ledger history.
- Import rows may explicitly map to or update an existing master. A mapped row's positive quantity remains a separate opening-balance approval tied to the import batch. Product-master updates cannot rewrite historical inventory or transactions.
- Every inventory approval item and movement resolves an existing active canonical `productId`. Missing, archived or unresolved exact-collision identities are rejected, and ledger input can never create a Product implicitly. Suspected existing duplicates remain review records until a separately authorised consolidation process is defined.

## Stock assurance actions

- A stock-count recommendation is a controlled action request, not a passive toast or allegation. Reasons use neutral, explainable rules such as overdue count, repeated variance, unusual movement or location inconsistency.
- `StockActionIncident` lifecycle is `NEW`, `ACKNOWLEDGED`, `ASSIGNED`, `IN_PROGRESS`, `AWAITING_REVIEW`, `APPROVED`, `REJECTED`, then `CLOSED`; overdue is an independent flag. Only one open incident exists per tenant, location, product/count scope and category. New evidence appends and may escalate severity.
- Stock actions are visible in the management queue and to permitted assigned staff. Start Count preserves and deep-links the tenant, location, product, working day, shelf, incident and count-session scope.
- A targeted count captures its opening quantity, inventory revision and timestamp. Sales continue during the count. Reconciliation includes signed inward and outward movements after the opening timestamp: adjusted expected quantity equals opening quantity plus net movements, and variance equals physical quantity less adjusted expected quantity.
- A count never changes inventory directly. Submission flows through review and approval to one idempotent immutable stock adjustment; rejection creates no movement. An incident closes only with an authorised recorded outcome.
