# Role and Permission Matrix

## Initial roles

- Vendor Owner
- Vendor Administrator
- Manager
- Warehouse Manager
- Warehouse Clerk
- Branch Manager
- Cashier
- Stock Controller
- Purchasing Officer
- Approver
- Auditor
- SCI Support Administrator

## Permission design

Permissions must be action-based, tenant-scoped and location-aware.

Examples:

- supplier.create
- purchase_request.create
- purchase_order.approve
- receiving.create
- receiving.approve
- transfer.dispatch
- transfer.receive
- stocktake.count
- stocktake.approve
- inventory.adjust
- shift.open
- shift.close
- sale.complete
- sale.discount
- sale.void
- sale.refund
- report.view
- bi.view
- staff.manage

## Rules

- A role name alone must not be treated as authorization.
- Permissions must be checked at execution time.
- Location assignments restrict applicable permissions.
- Segregation of duties may prohibit self-approval.
- Permission changes must be audited.
- SCI support access must be time-bound or explicitly authorized where practical.
