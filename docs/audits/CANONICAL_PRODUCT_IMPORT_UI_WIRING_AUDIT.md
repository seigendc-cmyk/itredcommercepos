# Canonical Product Import and UI Wiring Audit

## Audit scope and repository state

- Audit date: 2026-08-02
- Starting branch: `fix/canonical-product-import-ui-wiring`
- Starting commit: `f1213b370fd8a9d828b8148d8799d8a146a51dc7`
- Audit mode: evidence only; no application code, schema, dependency, or configuration changes were made.
- Required branch check: passed.
- Staged changes at audit start: none.
- Preserved pre-existing unstaged changes: `.gitignore`, `metadata.json`.
- Preserved pre-existing untracked paths: `.env.local`, `.env.local.backup-20260727-223128`, `.gitattributes`, `.vscode/`, `dist/`.

The branch already contains the implementation committed in `f1213b3`. This report therefore audits the current implementation and uses its parent revision only to identify the historical causes removed by that commit.

## Governing source-of-truth documents

- `docs/sot/PRODUCT_AND_STOCKTAKE_RULES.md`
- `docs/sot/INVENTORY_RULES.md`
- `docs/sot/INVENTORY_APPROVAL_RULES.md`
- `docs/sot/OFFLINE_ARCHITECTURE.md`
- `docs/sot/OFFLINE_BI_EVENTS.md`
- `docs/sot/OFFLINE_INFRASTRUCTURE_RULES.md`
- `docs/sot/SQLITE_SCHEMA.md`
- `docs/sot/AUTH_RULES.md`
- `docs/sot/ENTITLEMENT_RULES.md`

`docs/sot/README.md` and `docs/sot/MVP_SCOPE.md`, named by the repository-level agent instructions, do not exist on this branch.

## Inspected implementation files

### Product and import

- `src/types/index.ts`
- `src/services/db.ts`
- `src/services/productLifecycle.ts`
- `src/features/product-import/domain.ts`
- `src/features/product-import/parser.ts`
- `src/features/product-import/validator.ts`
- `src/features/product-import/posting.ts`
- `src/features/product-import/template-export.ts`
- `src/features/product-import/index.ts`
- `src/components/Products/ProductImportModal.tsx`
- `src/components/Products/ProductManagement.tsx`
- `src/components/Products/ProductModal.tsx`
- `src/App.tsx`

### Inventory, stocktake, approval, permissions, and BI

- `src/features/inventory/productLocationStockView.ts`
- `src/components/Inventory/StocktakeWorkspace.tsx`
- `src/components/Inventory/BILossPreventionModal.tsx`
- `src/components/Branch/StockAdjustmentModal.tsx`
- `src/components/Branch/BranchManagement.tsx`
- `src/components/Warehouse/WarehouseManagement.tsx`
- `src/components/Warehouse/ReceiveSupplierStockModal.tsx`
- `src/components/Warehouse/TransferStockModal.tsx`
- `src/components/POS/POSTerminal.tsx`
- `src/components/Approvals/ApprovalsWorkspace.tsx`
- `src/services/inventoryApprovalWorkflow.ts`
- `src/services/saleTransaction.ts`
- `src/services/supplierReceiving.ts`
- `src/services/stockTransferWorkflow.ts`
- `src/services/transferSlip.ts`
- `src/bi/types.ts`
- `src/bi/tracker.ts`
- `src/bi/analyticsEngine.ts`
- `src/components/BI/BIAuditDashboard.tsx`
- `src/components/Staff/StaffManagement.tsx`
- `src/components/Staff/StaffDesk.tsx`

### Offline, synchronization, tests, and build

- `src/offline/types.ts`
- `src/offline/migrations.ts`
- `src/offline/repositories.ts`
- `src/offline/offlineCheckout.ts`
- `src/offline/sync.ts`
- `src/offline/offlineDatabase.test.ts`
- `src/offline/offlineCheckout.test.ts`
- `src/features/product-import/productImport.test.ts`
- `src/features/inventory/productLocationStockView.test.ts`
- `src/components/Products/productUi.test.tsx`
- `src/services/productLifecycle.test.ts`
- `src/services/inventoryApprovalWorkflow.test.ts`
- `src/services/saleTransaction.test.ts`
- `src/services/supplierReceiving.test.ts`
- `src/services/stockTransferWorkflow.test.ts`
- `package.json`
- `package-lock.json`

The deleted historical `src/utils/productMatcher.ts`, historical `ProductImportModal`, and historical bulk-import implementation were inspected from `f1213b3^` to establish the original import failure mechanism.

## 1. Canonical Product model audit

The online Product model is `Product` in `src/types/index.ts:133`; compatibility normalization is `normalizeProduct` at `src/types/index.ts:160`.

| Field | Type | Interface requirement | Save-service requirement/current behavior |
| --- | --- | --- | --- |
| `id` | string | required | generated with `Math.random` if absent |
| `vendorId` | string | required | supplied by service scope |
| `sku` | string | required | required/nonblank; uniqueness not enforced by service |
| `name` | string | required | required/nonblank |
| `description` | string | optional | missing becomes empty string |
| `category` | string | required | required/nonblank |
| `size` | string | optional | preserved |
| `costPrice` | number | required | `Number(...)`; finite/nonnegative validation is not enforced in `saveProduct` |
| `sellingPrice` | number | required | `Number(...)`; finite/nonnegative validation is not enforced in `saveProduct` |
| `unitOfMeasure` | string | optional | service requires `unitOfMeasure` or legacy `unit` |
| `unit` | string | optional/deprecated | compatibility dual-write retained |
| `alternativeLookupCode` | string | optional | preserved; uniqueness not enforced server-side |
| `productType` | enum | optional | service requires it; normalizer invents legacy default `INVENTORY` |
| `barcode` | string | optional | preserved; uniqueness not enforced server-side |
| `reorderLevel` | number | required | converted with `Number`; blank manual entry becomes zero |
| `status` | active/archived | optional | normalizer and save default to `active` |
| `createdAt` | string | required | retained on update if caller supplies it, otherwise reset to now |
| `updatedAt` | string | optional | set by `saveProduct` and lifecycle writes |
| `brand`, `manufacturerCode` | string | optional | legacy consumers remain |
| `location`, `shelf`, `bin` | string | optional | global legacy operational fields remain on Product |

There is no `quantity` field on `Product`. The `product.quantity` hits in `src/services/db.ts` refer to local aggregate objects used during transfer and receipt processing, not Product documents.

### DTO and persistence findings

- There are no distinct product-create and product-update DTOs. `saveProduct(vendorId, product: Partial<Product>)` is both APIs (`src/services/db.ts:691`).
- `bulkImportProducts` is a thin loop over `saveProduct` (`src/services/db.ts:739`) and is currently unused by the canonical import UI.
- Firestore path `vendors/{vendorId}/products/{id}` is attempted first. Firestore errors are caught and only warned; the function then updates localStorage and returns success. This creates two competing success states.
- `fetchProducts` reads Firestore first, then localStorage, then starter products. An empty Firestore collection is treated like an unavailable collection and can resurrect local/starter data.
- `normalizeProduct` maps legacy `unit` to `unitOfMeasure`, retains/repairs `unit`, and defaults missing `productType` and `status`. No persistent bulk migration exists.
- Manual ProductModal and import both call the same save service, but manual creation/update emits no product BI event and carries no actor or permission context.

### Product constructors and fixtures

- Starter product fixtures and onboarding construction: `src/services/db.ts:141`, `src/services/db.ts:300`.
- Fetch fallback product construction: `src/services/db.ts:680`.
- Canonical import master conversion: `src/features/product-import/domain.ts:63`.
- Manual form construction: `src/components/Products/ProductModal.tsx:54`.
- Test fixtures: product import, lifecycle, sale transaction, supplier receiving, stocktake view-model, and UI tests.
- Offline product construction uses a separate `OfflineProductRecord`, not `Product`.

### Remaining naming and compatibility inconsistencies

- Many live consumers still read `product.unit`: POS, warehouse/branch inventory tables, receiving, transfer drafting, transfer slips, BI dashboard, and BI loss-prevention UI.
- Product-level `location`, `shelf`, and `bin` compete with location-scoped inventory semantics. BI and stocktake-related components still consume them.
- `brand` and `manufacturerCode` exist online and offline but are absent from the new import contract.
- The interface makes canonical `unitOfMeasure`, `productType`, `status`, and `updatedAt` optional even though online normalized reads generally supply them.
- `toProductMaster` turns missing cost, price, and reorder level into zero. For non-inventory products this remains an invented value rather than preserved absence.

### Offline model conflict

`OfflineProductRecord` and SQLite `products` contain SKU, name, brand, manufacturer code, barcode, and unit of measure. They do not contain description, category, size, cost, selling price, ALU, product type, lifecycle status, or canonical master timestamps. Offline products are also scoped to branch and terminal, whereas the online Product is vendor-scoped. Synchronization acceptance is deliberately unimplemented (`OfflineSyncCoordinator.drain`).

Result: the online Product model is canonical only within the connected application. The SOT requirement for one schema across offline snapshots and synchronization is not yet met.

## 2. Product import audit

### Current file acceptance and parsing

- File input: `src/components/Products/ProductImportModal.tsx:73` accepts `.csv` and `.xlsx` plus their canonical MIME values.
- Extension and MIME validation: `src/features/product-import/parser.ts:17`.
- CSV parser: state-machine parser at `parser.ts:26`; handles quoted commas, escaped quotes, CRLF/LF, empty fields, and BOM.
- XLSX parser: ExcelJS `arrayBuffer` load at `parser.ts:105`; it does not use text reading.
- Canonical headers: exactly 16 ordered headers at `domain.ts:7`.
- Header comparison trims whitespace/BOM and ignores case. Missing, duplicate, unexpected, count, and position errors reject the matrix before row creation.
- XLSX validates `templateName` and `templateVersion` when metadata exists. A workbook without `_Template_Metadata` is still accepted; CSV has no template-version channel.
- ExcelJS cell `.text` is used. Numeric SKU/barcode cells may already have lost leading zeroes before mapping.

### Row validation and duplicate handling

- Required: SKU, name, category, UM, product type; inventory also requires cost, price, and quantity.
- Quantity and numeric fields reject negative/non-finite values.
- Location code validation uses the currently loaded warehouse/branch codes supplied by App.
- Non-inventory, service, and other reject positive quantity; service rejects location/shelf/bin.
- BOM quantity is permitted and later routed through the opening-balance approval flow; no BOM component inference exists.
- In-batch SKU and barcode duplicates are errors. In-batch ALU duplicates are warnings.
- Existing exact SKU or barcode and existing ALU set `duplicateProduct` and require Update Existing or Skip.
- Fuzzy-name similarity is warning-only and never assigns a merge target.
- There is no transactional/server-side uniqueness check, so concurrent or stale-client duplicate creation remains possible.
- `ProductImportDecision` includes `OPENING_BALANCE`, but the UI never offers or consumes that decision.

### Current row trace

```text
file input
  -> validateImportFile(extension + MIME)
  -> CSV state parser OR ExcelJS Products sheet
  -> validateHeaders(exact canonical order)
  -> mapRow(explicit indexes after schema validation)
  -> validateImportRows
  -> detectProductDuplicates(existing in-memory products)
  -> ProductImportModal preview
  -> CREATE / UPDATE_EXISTING / SKIP decision
  -> toProductMaster
  -> saveProduct (Firestore attempt, then local cache)
  -> buildOpeningBalanceRequest when quantity > 0
  -> createApprovalRequest
  -> approval queue
  -> reviewApprovalRequest atomic balance/movement/audit/BI completion
  -> refreshAllData
```

### Current transactional gaps

- The import batch is not persisted as an entity.
- Rows are processed sequentially in App, not in one transaction. A later failure leaves earlier product masters and approval requests committed.
- `saveProduct` can report success after Firestore failure because localStorage is updated.
- A cashier or otherwise unauthorized actor can save one or more product masters before the first positive-quantity opening-balance request fails role authorization.
- The payload contains `idempotencyKey` and `expectedVersion`, but `createApprovalRequest` neither queries nor enforces either. Retrying creates another request ID.
- There is no rollback linking product master creation to approval-request creation.
- Import completion BI means the App loop completed; it is not backed by a durable batch record.

### Confirmed historical root cause of import misalignment

The parent revision's deleted `src/utils/productMatcher.ts` guessed whether row 1 was a header, then mapped fixed `cells[0..8]` regardless of actual headings. A source shaped differently from `SKU, Name, Category, Cost, SellingPrice, Quantity, Unit, Location, Shelf` shifted each semantic value into the next Product property. This is the direct mechanism by which SKU could appear as Product Name and Product Name as Category.

The same historical parser used `line.split(',')`, accepted TXT/TSV, used `FileReader.readAsText`, defaulted quantity to 10, invented category/cost/price/unit/location/shelf/SKU/barcode, and defaulted exact or fuzzy matches to `MERGE_STOCK`. Historical bulk persistence then wrote warehouse inventory directly. Those paths are deleted from the current tree and are not reachable now.

## 3. Product-management UI audit

The UI is implemented directly in `ProductManagement`; there is no separate product-list view model.

| Displayed value | Current source | Location-scoped? | Wiring assessment |
| --- | --- | ---: | --- |
| SKU | `product.sku` | no | wired |
| Product Name | `product.name` | no | wired |
| Description | `product.description` | no | wired; optional fallback dash |
| Category | `product.category` | no | wired |
| Size | `product.size` | no | wired; optional fallback dash |
| Cost | `product.costPrice` | no | wired |
| Price | `product.sellingPrice` | no | wired |
| Qty | selected `warehouseStock`/`branchStock` map by product ID | yes | wired, but can temporarily show the previous location during async switching and can contain invented fallback balances |
| UM | `product.unitOfMeasure || product.unit` | no | wired with legacy compatibility |
| Location | selected Warehouse/Branch code and name | yes | wired; initial state can remain blank when resource props arrive after first render |
| ALU | `product.alternativeLookupCode` | no | wired |
| Product Type | `product.productType` | no | wired; optional legacy field can be blank outside normalized reads |

### Controls

- Add Product: wired to App modal; no create permission or BI event.
- Edit Product: wired; no update permission or BI event.
- Import Products: wired; controlled only by access to the `products` menu.
- Export Template CSV/XLSX: wired; no export permission. BI is best-effort after the browser download is initiated.
- Archive/Delete and Restore: wired in desktop rows and enforced by lifecycle role checks. Mobile rows expose Edit only.
- Search: SKU, name, barcode, ALU; local state only by design.
- Category filter: absent.
- Show archived: wired local filter.
- Stock-location selector: invokes App fetch and changes the active stock map. There is no loading/error state or request-race protection.
- Desktop table scrolls horizontally and pins SKU/actions. Mobile keeps SKU/name/quantity/UM/location/type but omits lifecycle actions.

## 4. Product deletion and archiving audit

### Current flow

`App` calls `inspectProductUsage`, displays `window.confirm`, then calls `archiveOrDeleteProduct`. The service repeats usage inspection, determines hard-delete versus archive, enforces its role permission, writes Firestore/local cache, and emits BI.

### Dependency coverage

`inspectProductUsage` scans Firestore collections for product-ID text in serialized documents: warehouse inventory, branch inventory, inventory movements, orders, purchase orders, supplier receipts, transfers, adjustments, and approval requests.

| Dependency | Checked? | Notes |
| --- | ---: | --- |
| nonzero warehouse/branch stock | yes | all collection documents scanned |
| sales | yes | scans `orders` |
| purchase orders | yes | scans `purchase_orders` |
| supplier receipts | yes | scans `supplier_receipts` |
| transfers | yes | scans `transfers` |
| stocktakes/adjustments | yes | scans `adjustments` and approvals |
| approval history | partial | request documents checked; append-only `approval_events` is not scanned |
| movements | yes | scans `inventory_movements` |
| BOM dependencies | no | no BOM component/dependency model exists |
| offline records/history | no | SQLite is not inspected |
| localStorage-only history | no | usage inspection has no local fallback |

### Risks

- Hard deletion can proceed despite an `approval_events`-only reference, a BOM dependency, offline history, or local-only history.
- String-searching JSON is conservative but imprecise: substring collisions can force unnecessary archive, and collection-wide scans will not scale.
- There is no immutable audit event for product delete/archive/restore; only best-effort BI.
- Delete removes only the Firestore Product document; it does not remove zero-balance inventory documents, prices, offline snapshots, or other auxiliary records.
- Lifecycle authorization is enforced server-side in the client service, but Firestore security-rule enforcement was not covered by tests in this repository audit.

## 5. Inventory ownership audit

### Online balance records

- Warehouse: `WarehouseInventory`, Firestore `vendors/{vendorId}/warehouse_inventory/{vendorId}_{warehouseId}_{productId}`.
- Branch: `BranchInventory`, Firestore `vendors/{vendorId}/branch_inventory/{vendorId}_{branchId}_{productId}`.
- Movement history: Firestore `inventory_movements`, generally including before, delta, after, location, source, and timestamp.
- Product contains no quantity, but still carries global `location`, `shelf`, and `bin`.

### Authority by workflow

- Online checkout correctly rereads Firestore branch inventory inside its transaction and writes order, balances, and movements atomically.
- Approval completion rereads Firestore inventory and writes balance, movement, approval, audit, and one deterministic BI completion event atomically.
- Transfer dispatch/receipt and supplier receipt paths use Firestore transactions and movement records.
- UI product-list quantities are snapshots in App state loaded through `fetchWarehouseStock`/`fetchBranchStock`.

### Conflicts and bypasses

- Empty/unavailable warehouse fetch invents 100 units for every product; empty/unavailable branch fetch invents 25 units. These values are saved to localStorage and displayed as if real.
- Onboarding directly seeds 100 warehouse and 25 branch units per starter product without approval, movement, audit, or BI.
- `adjustBranchStock` sends opening balance and recount through approval, but damage/return/other directly mutate branch balance, clamp at zero, and create no immutable movement.
- StockAdjustmentModal defaults new lines to 50 or 20 units and contains stale copy saying opening inventory is added directly, although opening balance now enters approval.
- The localStorage cache is mutable and has no version, occurrence provenance, or reconciliation state.
- SQLite has its own `branch_stock_balances` and `inventory_movements`; synchronization acceptance is missing, so it is not reconciled with online balance authority.

Result: Firestore location inventory is the intended online authority, but fallback/seed/direct-adjustment paths compete with it and violate the movement invariant.

## 6. Stocktake and stock-adjustment audit

### Current stocktake trace

```text
Product[] + selected resource + App stock map
  -> filter active INVENTORY products
  -> buildProductLocationStockView
  -> explicit named cells
  -> countedQuantities[productId]
  -> delta = counted - displayed system quantity
  -> App createApprovalRequest(STOCKTAKE_ADJUSTMENT)
  -> ApprovalsWorkspace expected request version decision
  -> reviewApprovalRequest rereads current balance
  -> current balance + submitted delta
  -> adjustment + movement + approval events + atomic BI
```

### Mapping assessment

- Current main stocktake table uses explicit named fields. No `Object.values`, generic cell arrays, or object-order rendering exists in this flow.
- The historical stocktake did not show evidence of positional array mapping either. The historical mixed-field cause was semantic: the table consumed Product directly, combined name/SKU/category into one cell, used legacy `unit`, read global product location/shelf, and fabricated `Shelf #N` from array index.
- The new adapter fixes identity column alignment, but shelf/bin still come from Product rather than a product-location record. It therefore cannot represent different shelf/bin assignments across branches/warehouses.
- `BILossPreventionModal` still fabricates shelves and BI anomalies using array-index modulo rules. Stocktake BI filter options other than high-value currently return no rows, while the separate BI modal still presents synthetic anomaly claims.
- `STOCKTAKE_MAPPING_VALIDATION_FAILED` exists in the event catalogue but is never emitted; the adapter performs no runtime mapping validation.

### Concurrency and balance revision risk

Stocktake stores `systemQty`, `countedQty`, and `quantityDelta` in the request, but approval applies only the submitted delta to the balance reread at approval time. There is no inventory expected version, count-session baseline, count timestamp, or absolute reconciliation rule. If sales continue after the displayed system quantity was captured, applying the old delta to the new balance can produce the wrong closing quantity. Sales do continue; there is no location/SKU freeze or session model.

Submission itself does not mutate inventory and correctly creates a variance proposal. Rejection/cancellation creates no movement. Approval records before/after decisions, but they are revisions of the approval-time balance, not a versioned stocktake session.

### Other adjustment path

StockAdjustmentModal is a second count/adjustment surface. Opening balance and recount enter approval; damage, return, and other mutate branch inventory directly, clamp negative results to zero, and bypass movements/audit/BI. This is a competing inventory posting path.

## 7. Approval workflow audit

### Authoritative implementation

- Policy and pure transitions: `src/services/inventoryApprovalWorkflow.ts`.
- Firestore persistence and entity-specific atomic posting: `createApprovalRequest`/`reviewApprovalRequest` in `src/services/db.ts`.
- UI: `src/components/Approvals/ApprovalsWorkspace.tsx`.

All helpers imported by `db.ts` are exported. There is no missing import/export mismatch. `completeApprovedRequestAtomically` is exported and tested but unused by the production Firestore implementation, which manually calls the same transition helpers; this is duplicated orchestration.

### Controls present

- Submit roles: sysadmin, manager, warehouse staff.
- Approval roles: sysadmin, manager.
- Segregation of duties: enforced by service transition.
- Expected version: enforced for review decisions.
- Duplicate/stale decisions: rejected.
- Requester/authorized cancellation: enforced.
- Rejection/cancellation: no stock movement.
- Approved inventory posting: transactionally rereads resources and balances and writes balance, movement, approval, audit, and BI.
- Failure after an approval attempt: records FAILED in a subsequent transaction when state/version still permit it.
- Notification routing: stored audience roles and filtered approvals UI only; no durable notification/outbox service.

### Requested semantic support

| Requested semantic | Current support |
| --- | --- |
| `OPENING_BALANCE` | supported as `OPENING_BALANCE_ADJUSTMENT` |
| `STOCKTAKE_VARIANCE` | supported as `STOCKTAKE_ADJUSTMENT` |
| `PRODUCT_IMPORT_STOCK` | no distinct type; import aliases it to `OPENING_BALANCE_ADJUSTMENT` with batch metadata |

### Gaps

- Payload `idempotencyKey` is not enforced.
- Payload `expectedVersion` from import is not used.
- Approval version does not version the inventory balance.
- No unique constraint/query prevents duplicate requests for the same entity/import row.
- Create transition audit documents are written as DRAFT/SUBMITTED/PENDING, while only PENDING is stored as the request state.
- General BI transition logs occur after transactions and are best-effort; only the completion BI event is inside the approval transaction.

## 8. Permission audit

There is no application-wide permission catalogue or authorization service. Product lifecycle uses a small role map; inventory approval uses workflow role policies; all other product actions rely on menu access and UI placement.

| Permission | Exists? | UI check | Service check | Direct-call bypass? |
| --- | ---: | --- | --- | ---: |
| `product.view` | no | `products` menu only | none | yes |
| `product.create` | no | `products` menu only | none in `saveProduct` | yes |
| `product.update` | no | `products` menu only | none in `saveProduct` | yes |
| `product.import` | no | `products` menu only | product save none; quantity request role policy only | yes/partial |
| `product.template.export` | no | `products` menu only | none | yes |
| `product.delete` | yes, lifecycle-local | button visible to any product-menu user | sysadmin only | no through lifecycle service; Firestore rules unverified |
| `product.archive` | yes, lifecycle-local | button visible to any product-menu user | sysadmin/manager | no through lifecycle service; Firestore rules unverified |
| `product.restore` | yes, lifecycle-local | button visible to any product-menu user | sysadmin/manager | no through lifecycle service; Firestore rules unverified |
| `inventory.opening_balance.request` | no named permission | product/branch UI | approval submit role policy | cashier blocked only when request is created |
| `inventory.opening_balance.approve` | no named permission | approval audience role | sysadmin/manager role policy | no through workflow service |
| `stocktake.perform` | no | products menu | submission uses approval submit roles | cashier can perform UI work but submission fails |
| `stocktake.review` | no | approval audience/requester | cancel/decision policies | decision cannot bypass service role check |
| `stocktake.variance.approve` | no named permission | approval audience | sysadmin/manager role policy | no through workflow service |

### Security risks

- App creates a fallback sysadmin staff profile when staff loading is empty or fails. A data-load failure can therefore elevate the active local profile.
- Product create/update/import/export services accept no actor and cannot authorize.
- Menu grants are navigation controls, not service authorization.
- Import can partially create masters before an unauthorized opening-balance submission fails.
- Firestore security rules and emulator enforcement are not exercised by the current tests.

## 9. BI and audit event audit

### Event catalogue coverage

| Event | Declared | Emitted |
| --- | ---: | ---: |
| product creation | yes | import only; manual create missing |
| product update | yes | import only; manual update missing |
| import template export | yes | yes |
| import start | yes | yes |
| import rejection | yes | yes |
| import validation | yes | yes |
| import row rejection | yes | yes |
| import completion | yes | yes |
| duplicate detection | yes | yes for warning rows |
| opening-balance request | yes | import-created requests only |
| product archive/delete/restore | yes | yes |
| stocktake mapping failure | yes | no |
| stocktake variance | no distinct event | only generic inventory transition on request/review |
| approval result | generic types declared | workflow emits `INVENTORY_WORKFLOW_TRANSITION`, not `APPROVAL_DECISION` |

`analyticsEngine` counts `APPROVAL_DECISION`, so current inventory decisions do not contribute to its approval metrics.

### Event model and persistence

- General BI authority: `logBIEvent` in `src/bi/tracker.ts`.
- Firestore path is vendor-scoped `bi_logs`; localStorage keeps only the newest 500 and is mutable.
- Event IDs are random and not duplicate-protected.
- Top-level event has `vendorId` but no required `tenantId`; tenant/batch/product/location/outcome/reason/occurrence fields are optional details rather than a typed contract.
- Missing actor defaults to “System Admin”/sysadmin, which can misattribute events.
- Firestore failure is swallowed, so callers receive a successful BI event object even if only local cache or neither persistence target succeeded.
- Atomic approval completion uses an inline BI document shape in `db.ts`, creating a second writer and event-construction implementation.
- Approval audit records are append-oriented Firestore documents; lifecycle actions have BI only, no audit record.
- Offline BI/audit uses separate append-only SQLite tables and is not synchronized to the online catalogue.

## 10. Tests and quality scripts

### Existing commands

| Command | Result during audit | Notes |
| --- | --- | --- |
| `npm run typecheck` | pass | TypeScript `tsc --noEmit` |
| `npm run lint` | pass | also `tsc --noEmit`; no ESLint/static-style linting |
| `npm test` | pass, 86/86 | explicit test-file list using `tsx --test` and `.env.test` |
| `npm run build` | pass | Vite; warns that the main JS chunk is about 2.46 MB (644 KB gzip) |

No dependency installation or script repair was performed.

### Relevant coverage present

- CSV/XLSX acceptance, extension rejection, header validation, quoted CSV, quantity validation, location validation, service quantity, duplicates, and opening-balance request planning.
- Product table/picker server-rendered UI contract.
- Explicit stocktake view-model mapping.
- Lifecycle outcome and role permission helpers.
- Approval role, segregation, stale/duplicate decision, rejection/cancel, and atomic helper behavior.
- Sale atomicity, inventory isolation, and rollback.
- Supplier receiving and transfer workflow rules.
- Offline schema, scope isolation, checkout atomicity, movements, audit, BI, backup, and encryption.

### Acceptance gaps

- No browser/E2E runner or authenticated UI workflow test.
- No Firebase emulator integration test.
- No end-to-end import test covering actual product Firestore write, approval request persistence, approval, balance, movement, audit, BI, and refresh.
- No import partial-failure or retry/idempotency test.
- No concurrent duplicate SKU/barcode/ALU test.
- No service-permission tests for product view/create/update/import/export or stocktake perform/review.
- No lifecycle integration test for every dependency collection, approval events, BOM dependencies, offline records, and audit writes.
- No test proving archived product rejection at every direct service boundary.
- No multi-location shelf/bin model test.
- No stocktake concurrent-sale/version-conflict test.
- No test that every onboarding/direct adjustment balance change creates a movement.
- No migration test from the online Product schema to the incomplete offline Product schema.
- No sync acceptance tests because server acceptance is not implemented.
- No code-coverage command or threshold.

## 11. Current competing implementations and root causes

| Conflict | Evidence | Risk |
| --- | --- | --- |
| Firestore products vs localStorage products vs offline SQLite products | `fetchProducts`, `saveProduct`, `OfflineProductRepository` | conflicting success/schema/authority |
| Firestore balances vs invented local fallback balances | `fetchWarehouseStock`, `fetchBranchStock` | UI can display non-existent stock |
| approval adjustment vs direct adjustment | `reviewApprovalRequest` vs non-opening/recount `adjustBranchStock` | movements and authorization can be bypassed |
| BI tracker vs inline atomic BI writer vs offline BI | `bi/tracker.ts`, `db.ts`, SQLite | inconsistent fields, durability, dedupe |
| workflow atomic helper vs manual Firestore orchestration | `completeApprovedRequestAtomically` unused by `db.ts` | duplicated state-transition orchestration |
| online Product vs OfflineProductRecord | types/migrations | canonical schema cannot synchronize losslessly |
| Product global shelf/bin vs selected stock location | Product and stocktake adapter | wrong shelf/bin for multi-location product |
| menu grants vs lifecycle role map vs inventory workflow roles | App/services | no coherent least-privilege model |

## 12. Implementation impact map

| Area | Existing authoritative file/service | Required change | Migration risk | UI wiring impact | Tests required |
| --- | --- | --- | --- | --- | --- |
| Product type | `src/types/index.ts` | make canonical fields explicit while retaining controlled legacy decode | high: legacy Firestore and consumers | all product consumers | legacy normalization and round-trip migration |
| Product persistence | `src/services/db.ts` | split create/update DTOs; fail closed; enforce uniqueness/permissions/audit | high | manual/import error handling | emulator CRUD, uniqueness, permission, failure tests |
| Import parser | `features/product-import/parser.ts` | retain strict parser; decide metadata requirement and numeric-code policy | medium | rejection messages | BOM, MIME, leading-zero, version cases |
| XLSX parser | ExcelJS parser | bound workbook/row size and harden malformed workbook handling | medium | progress/error UI | malformed/oversize/security tests |
| Template exporter | `template-export.ts` | add permission and export-result acknowledgement | low | export action state | workbook sheets, metadata, validation, permissions |
| Import validator | `validator.ts` | remove zero invention for absent noninventory prices; server revalidation | medium | preview errors | all product-type matrices |
| Duplicate handling | client validator | transactional server uniqueness and identifier correction workflow | high | row editor/resolution UI | races and resolution decisions |
| Opening balance | `posting.ts` + approval | persist batch, enforce idempotency, link master/request atomically | high | batch status/retry UI | retry, partial failure, approval integration |
| Product table | `ProductManagement.tsx` | introduce typed list-row model/loading/race control | medium | selector/table/mobile actions | multi-location and race UI tests |
| ProductModal | modal + `saveProduct` | typed validation, actor, permission, audit/BI | medium | field errors/role gating | create/update service and UI tests |
| Delete/archive | lifecycle + db | indexed reference registry/query, BOM/offline/audit coverage | high | explain dependency result | every dependency and authorization case |
| Stocktake mapping | `productLocationStockView.ts` | source shelf/bin from location assignment; runtime validation | high | table and BI modal | per-location mapping and failure-event tests |
| Stocktake session | missing | create versioned count-session/baseline reconciliation | high | session lifecycle/conflict UI | concurrent sales and approval reconciliation |
| Approval workflow | workflow + db | enforce request idempotency/inventory version; consolidate helper | high | stale/conflict handling | emulator atomic/idempotency/failure tests |
| Permissions | conflict/missing | one permission catalogue and service enforcement | high security | hide/disable with reason | direct-call matrix and Firestore-rule tests |
| BI events | tracker + inline writer | typed envelope, actor required, deterministic idempotency, one writer | medium | failure observability | field/dedupe/tenant/durability tests |
| Offline data | SQLite migrations/repository | add canonical fields and a lossless mapping | high | offline product availability | migrations, backup, compatibility |
| Synchronization | `offline/sync.ts` | future authoritative acceptance/reconciliation per approved scope | critical/out of current scope | sync/conflict states | server contract and conflict tests |

## 13. Recommended exact implementation sequence

1. Establish one permission catalogue and enforce product create/update/import/export plus stocktake request permissions in services. Remove automatic sysadmin elevation on data-load failure.
2. Split product create/update inputs from stored Product, implement a fail-closed Firestore repository, add transactional SKU/barcode/ALU uniqueness, and emit audit plus BI through one writer.
3. Define a durable import-batch record and server-side row posting/idempotency contract. Preserve strict parser/validator behavior but make batch posting resumable and non-partial.
4. Remove invented 100/25 fallback inventory and migrate onboarding stock to opening-balance requests or an explicitly governed seed workflow with movements.
5. Introduce a typed product-list row adapter with resource loading state; keep location-scoped quantity separate from Product.
6. Add a product-location assignment model for shelf/bin and update stocktake/BI views to use it. Delete synthetic modulo-based BI flags.
7. Add a versioned stocktake session and approval-time reconciliation rule that is safe while sales continue.
8. Consolidate approval orchestration around one atomic helper, enforce idempotency and inventory expected versions, and add durable notifications if required.
9. Expand SQLite Product schema to the canonical fields only after an approved migration and synchronization contract exist.
10. Add emulator integration, permission-matrix, concurrency, and browser tests before accepting implementation.

### Recommended first implementation slice

Start with permission and persistence fail-closed behavior: create explicit `CreateProductInput`/`UpdateProductInput`, a single permission catalogue, and an authoritative product repository that rejects Firestore failure and enforces SKU/barcode/ALU uniqueness. This prevents unauthorized and locally-successful product mutations before import batching or UI work builds on them.

## 14. Proposed file changes for the next phase

### Proposed additions

- `src/auth/permissions.ts` or an equivalent existing auth-policy extension for the unified permission catalogue.
- `src/services/productRepository.ts` only if `db.ts` cannot be safely decomposed without duplication; it must replace, not parallel, current product persistence.
- `src/types/productInputs.ts` or co-located create/update DTOs.
- `src/features/product-import/importBatchService.ts` for durable idempotent posting.
- `src/features/products/productListView.ts` for the typed list row.
- `src/features/inventory/productLocationAssignment.ts` and a versioned stocktake-session model.
- Emulator and browser test files using the repository's selected test infrastructure.

### Proposed modifications

- `src/types/index.ts`
- `src/services/db.ts`
- `src/services/productLifecycle.ts`
- `src/services/inventoryApprovalWorkflow.ts`
- `src/features/product-import/*`
- `src/features/inventory/productLocationStockView.ts`
- `src/components/Products/*`
- `src/components/Inventory/StocktakeWorkspace.tsx`
- `src/components/Inventory/BILossPreventionModal.tsx`
- `src/components/Branch/StockAdjustmentModal.tsx`
- `src/App.tsx`
- `src/bi/types.ts`
- `src/bi/tracker.ts`
- `src/offline/types.ts`
- `src/offline/migrations.ts`
- `src/offline/repositories.ts`
- `firestore.rules`
- relevant SOT documents and tests.

### Files/services that must not be duplicated

- Product master model in `src/types/index.ts`.
- Product persistence currently exposed from `src/services/db.ts`.
- Warehouse/branch balance collections.
- `inventory_movements` ledger.
- `inventoryApprovalWorkflow.ts` transition policy.
- `reviewApprovalRequest` atomic posting path.
- BI catalogue and tracker.
- Offline SQLite migration/repository infrastructure.
- Product import parser/validator/template feature boundary.

## 15. Canonical authority conclusion

1. Authoritative Product model: `src/types/index.ts::Product` for online use. **CONFLICT — offline Product schema is incomplete and differently scoped.**
2. Authoritative product persistence service: intended `src/services/db.ts::fetchProducts/saveProduct`. **CONFLICT — Firestore/localStorage success semantics and OfflineProductRepository compete.**
3. Authoritative warehouse balance: Firestore `warehouse_inventory` location record. **CONFLICT — fetch fallback invents local balances.**
4. Authoritative branch balance: Firestore `branch_inventory`; online checkout uses it transactionally. **CONFLICT — UI fallback and offline SQLite are unreconciled.**
5. Authoritative inventory movement record: Firestore `inventory_movements` for online operations and SQLite `inventory_movements` offline. **CONFLICT — onboarding and direct adjustment bypass it; sync is missing.**
6. Authoritative approval workflow: state policy in `src/services/inventoryApprovalWorkflow.ts` plus Firestore orchestration in `src/services/db.ts`. **CONFLICT — unused atomic helper duplicates production orchestration, but no import/export mismatch exists.**
7. Authoritative permission service: **MISSING — must be created.**
8. Authoritative BI event service: intended `src/bi/tracker.ts::logBIEvent`. **CONFLICT — inline atomic and offline writers use different contracts.**
9. Authoritative product-list view model: **MISSING — must be created.** `ProductManagement` composes rows ad hoc.
10. Authoritative stocktake view model: `src/features/inventory/productLocationStockView.ts`. **CONFLICT — shelf/bin are still global Product fields and there is no versioned count-session model.**

## 16. Blockers before implementation acceptance

- Approval of a unified permission model and removal/replacement of fallback sysadmin elevation.
- Decision on fail-closed online persistence versus permitted offline product editing.
- Approved migration strategy for legacy online Product and incomplete offline Product schemas.
- Server-side uniqueness and import-batch idempotency design.
- Product-location shelf/bin ownership model.
- Stocktake concurrency rule when sales continue.
- Elimination or formal governance of invented stock and direct adjustment paths.
- Firebase emulator/security-rule and browser-test infrastructure.
- Synchronization remains explicitly outside current approved scope; offline canonical changes must not imply completed server acceptance.

No implementation should begin until these authority and migration decisions are reviewed.
