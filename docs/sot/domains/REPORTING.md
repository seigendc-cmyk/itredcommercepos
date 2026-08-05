# Reporting

## 1. Principle

Reports derive from authoritative transactions, ledgers and events.

Reports must not mutate operational records.

## 2. Report contract

Every report must define:

- report name;
- business purpose;
- authoritative source records;
- filters;
- grouping;
- calculations;
- permission;
- tenant scope;
- location scope;
- timezone;
- currency treatment;
- export formats;
- reconciliation rule;
- freshness or generation time.

## 3. Sales reports

Required reports:

- daily sales summary;
- sales by branch;
- sales by terminal;
- sales by cashier;
- sales by product;
- sales by category;
- payment-method totals;
- discount report;
- price override report;
- void report;
- refund report;
- offline sale report;
- gross profit report where cost data is authorized.

## 4. Shift and cash reports

Required reports:

- open shifts;
- closed shifts;
- shift sales;
- opening float;
- cash movements;
- expected cash;
- counted cash;
- cash variance;
- payment reconciliation;
- delayed shift closure;
- supervisor intervention.

## 5. Inventory reports

Required reports:

- stock on hand;
- available stock;
- reserved stock;
- in-transit stock;
- damaged stock;
- quarantined stock;
- inventory valuation;
- stock movement ledger;
- low stock;
- out of stock;
- inventory adjustment;
- negative-stock attempt;
- product movement history.

## 6. Purchasing reports

Required reports:

- purchase requisitions;
- purchase orders;
- open purchase orders;
- partially received purchase orders;
- overdue purchase orders;
- purchase value by supplier;
- purchase price variance;
- cancelled purchase orders;
- approval turnaround.

## 7. Receiving reports

Required reports:

- supplier receipts;
- receipts by warehouse;
- receipts by supplier;
- accepted quantities;
- damaged quantities;
- rejected quantities;
- non-PO receipts;
- over-receipt attempts;
- receipt reversals;
- receiving actor activity.

## 8. Stocktake reports

Required reports:

- stocktake progress;
- overdue counts;
- first-count variance;
- recount variance;
- approved variance;
- variance by product;
- variance by category;
- variance by location;
- variance by counter;
- recurring variance;
- stocktake adjustment value;
- unresolved disputes.

## 9. BI and control reports

Required reports:

- events by severity;
- blocked transactions;
- failed transactions;
- repeated refunds;
- repeated voids;
- price overrides;
- shift shortages;
- repeated stock variance;
- failed login activity;
- privileged actions;
- offline activity;
- synchronization failure;
- approval bottlenecks.

## 10. Tenant and permissions

Every report query must enforce:

- tenant isolation;
- role permission;
- assigned location scope;
- allowed date range where policy applies;
- sensitive field masking.

A client-provided vendor ID must not independently grant report access.

## 11. Timezone

Operational reports must clearly state the timezone used.

Date grouping must be based on the approved vendor or branch business timezone, not an unlabelled browser timezone.

## 12. Currency

Reports must not silently combine currencies.

Where currency conversion is supported, the report must state:

- original currency;
- converted currency;
- exchange rate;
- rate source;
- rate date.

## 13. Reconciliation

Reports must reconcile to source records.

Examples:

- sales total reconciles to completed sale records;
- payment total reconciles to accepted payments;
- shift total reconciles to shift transactions;
- stock balance reconciles to ledger;
- stocktake adjustment reconciles to posted adjustment movements;
- purchase outstanding quantity reconciles to ordered less accepted receipts.

## 14. Export

Approved export formats may include:

- CSV;
- XLSX;
- PDF;
- printable view.

Export must preserve tenant and permission controls.

Sensitive report export must generate an audit and BI event.

## 15. Acceptance criteria

- Cross-tenant reporting is rejected.
- Report totals reconcile to source records.
- Timezone and currency are visible.
- Report queries do not mutate business records.
- Sensitive exports are logged.
- Suspended locations retain historical reporting.
