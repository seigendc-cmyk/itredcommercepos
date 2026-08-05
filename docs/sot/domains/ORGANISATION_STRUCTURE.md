# Organisation Structure

## 1. Canonical hierarchy

```text
Vendor tenant
â”œâ”€â”€ Warehouse
â””â”€â”€ Branch
    â””â”€â”€ POS terminal
```

A warehouse and branch are stock locations with different operational capabilities.

## 2. Location types

```typescript
type StockLocationType =
  | "WAREHOUSE"
  | "BRANCH";
```

## 3. Warehouse capabilities

A warehouse may:

- receive supplier deliveries;
- hold central inventory;
- issue warehouse-to-branch transfers;
- receive branch returns;
- return stock to suppliers;
- perform stocktakes;
- hold damaged or quarantined stock;
- process inventory adjustments through controlled workflows.

A warehouse must not:

- host a POS terminal;
- operate a sales cart;
- process customer checkout;
- complete a customer sale;
- provide warehouse stock directly to a branch checkout.

## 4. Branch capabilities

A branch may:

- receive warehouse transfers;
- hold branch inventory;
- host one or more licensed POS terminals;
- operate carts;
- complete customer sales;
- process controlled returns;
- perform branch stocktakes.

A branch must not receive supplier deliveries directly.

## 5. Terminal rules

Every active terminal must:

- belong to one vendor;
- belong to one branch;
- never belong to a warehouse;
- have an active licence or entitlement;
- have a unique terminal identifier;
- record application and device context;
- be auditable.

Every sale must contain:

- `tenantId`
- `vendorId`
- `branchId`
- `terminalId`
- `cashierId`
- `shiftId`
- `stockLocationId`

For a customer sale, `stockLocationId` must resolve to the selling branch.

## 6. Resource states

Warehouses, branches and terminals use:

```text
PROVISIONING
ACTIVE
SUSPENDED
ARCHIVED
```

A suspended or archived resource must retain historical records.

Suspension must prevent new transactions but must not delete:

- sales;
- shifts;
- inventory movements;
- stocktakes;
- approvals;
- BI events;
- audit records.

## 7. Subscription controls

The Starter Plan includes:

- one warehouse;
- one branch;
- one terminal.

Additional warehouses, branches and terminals require separate active entitlements.

A resource may exist in a non-operational state before licensing, but it must not transact until licensed and activated.

## 8. Required events

- `WAREHOUSE_CREATED`
- `WAREHOUSE_ACTIVATED`
- `WAREHOUSE_SUSPENDED`
- `BRANCH_CREATED`
- `BRANCH_ACTIVATED`
- `BRANCH_SUSPENDED`
- `TERMINAL_CREATED`
- `TERMINAL_ACTIVATED`
- `TERMINAL_SUSPENDED`
- `RESOURCE_LICENSE_BLOCKED`

## 9. Acceptance criteria

- Supplier receipt into a branch is rejected.
- Cart operation in a warehouse is rejected.
- Terminal creation under a warehouse is rejected.
- A terminal cannot transact when suspended or unlicensed.
- Historical records remain accessible after resource suspension.
