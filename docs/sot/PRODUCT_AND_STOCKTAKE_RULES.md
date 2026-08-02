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
