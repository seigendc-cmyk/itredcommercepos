# iTredPOS OS Product Charter

## Product purpose

iTredPOS OS is an industrial-grade multi-tenant commerce control system designed to protect stock, sales, cash, staff accountability and business records.

The system must prioritize:

- operational correctness;
- tenant isolation;
- inventory integrity;
- financial traceability;
- controlled approvals;
- offline resilience;
- auditability;
- recoverability;
- explainable business intelligence.

## Core operating model

Every vendor tenant must have:

- at least one warehouse;
- at least one branch;
- at least one terminal attached to a branch.

Supplier inventory enters through a warehouse.

Branches receive inventory through controlled stock transfers.

Warehouses do not host POS terminals, operate carts or complete customer sales.

Only branches may host terminals and process sales.

## Product boundary

The first industrial release is focused on:

- tenancy;
- purchasing;
- receiving;
- inventory;
- stocktake;
- sales;
- shift and cash control;
- approvals;
- BI logging;
- notifications;
- reporting.

Marketplace, logistics, payroll, full accounting and unrelated ecosystem modules are outside the first release unless explicitly added to MVP_SCOPE.md.
