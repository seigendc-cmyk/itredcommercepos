# Industrial MVP Scope

## Objective

Deliver a secure, auditable and recoverable operational POS that supports the complete flow from purchasing and receiving through inventory control, stocktake and customer sale.

## Included modules

### 1. Tenancy and onboarding

- Vendor tenant registration.
- Seven-day demo entitlement.
- Vendor verification submission to SCI Console.
- Default warehouse provisioning.
- Default branch provisioning.
- Default terminal provisioning.
- Staff membership, roles and permissions.
- Tenant suspension and entitlement enforcement.

### 2. Organisation structure

- Warehouses.
- Branches.
- POS terminals.
- Staff assignments.
- Location activation, suspension and archival.

### 3. Suppliers and purchasing

- Supplier registration.
- Purchase requisitions.
- Purchase orders.
- Purchasing approval thresholds.
- Partial fulfilment.
- Outstanding quantities.
- Purchase-order closure and cancellation.

### 4. Supplier receiving

- Supplier delivery into warehouse only.
- Purchase-order receiving.
- Controlled non-PO receiving.
- Accepted, damaged and rejected quantities.
- Partial receiving.
- Cost capture.
- Goods received note.
- Receiving approval.
- Inventory ledger posting.

### 5. Inventory

- Warehouse stock.
- Branch stock.
- Append-only stock ledger.
- Warehouse-to-branch transfers.
- Branch receipt confirmation.
- Opening balances.
- Controlled adjustments.
- Damaged, quarantined and in-transit stock.
- Reorder levels.
- Product movement history.

### 6. Stocktake

- Full stocktake.
- Cycle count.
- Random spot check.
- Risk-triggered spot check.
- Blind count.
- Recount.
- Variance investigation.
- Approval.
- Adjustment posting.

### 7. Sales

- Shift opening.
- Terminal authorization.
- Branch-scoped cart.
- Product search and barcode capture.
- Price, tax and discount calculation.
- Payment capture.
- Atomic sale posting.
- Branch stock deduction.
- Receipt generation.
- Sales history.
- Controlled offline checkout.
- Voids, returns and refunds.
- Shift closing and cash reconciliation.

### 8. Approvals

- Purchase approvals.
- Receiving approvals.
- Transfer approvals.
- Stock adjustment approvals.
- Stocktake variance approvals.
- Discount approvals.
- Void and refund approvals.
- Shift variance approvals.
- Staff and permission-change approvals where required.

### 9. BI logging

- Append-only meaningful business events.
- Sales, inventory, purchasing, receiving and stocktake events.
- Staff and approval behaviour.
- Cash and shift exceptions.
- Authentication and privileged-access events.
- Offline and synchronization events.
- Explainable risk indicators.

### 10. Notifications

- Approval-required notifications.
- Approval outcomes.
- Low-stock warnings.
- Stocktake assignments and recounts.
- Transfer and receiving exceptions.
- Shift and cash variances.
- Failed synchronization.
- Entitlement expiry.
- Security and suspicious-activity alerts.

### 11. Reporting

- Daily sales.
- Sales by branch, terminal, cashier and product.
- Payment-method totals.
- Shift reconciliation.
- Stock on hand.
- Inventory valuation.
- Stock movement.
- Stocktake variance.
- Purchase orders.
- Supplier receiving.
- Low-stock and exception reports.
- Approval turnaround.
- BI and staff-risk reports.

## Explicit exclusions

The following are excluded unless this document is formally amended:

- marketplace discovery;
- delivery and logistics fulfilment;
- payroll;
- full general-ledger accounting;
- advanced CRM campaigns;
- autonomous AI decision-making;
- manufacturing;
- supplier marketplace;
- complex multi-country fiscalization;
- unrelated SCI ecosystem modules.

## Industrial MVP completion test

The MVP is complete only when a vendor can:

1. Be onboarded securely.
2. Receive its default warehouse, branch and terminal.
3. Register a supplier and product.
4. Create and approve a purchase order.
5. Receive stock into the warehouse.
6. Transfer stock to a branch.
7. Confirm branch receipt.
8. Open an authorized shift.
9. Complete a customer sale.
10. Record payment and issue a receipt.
11. Deduct branch stock atomically.
12. Close and reconcile the shift.
13. Perform and approve a stocktake.
14. Review audit, BI, notifications and reports.
15. Operate safely under approved offline conditions.
