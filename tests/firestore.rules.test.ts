import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, before, beforeEach, test } from 'node:test';
import {
  RulesTestEnvironment,
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  deleteDoc,
  doc,
  getDoc,
  setDoc,
  updateDoc,
} from 'firebase/firestore';

const PROJECT_ID = 'itred-pos-rules-test';
const VENDOR_A = 'vendor-a';
const VENDOR_B = 'vendor-b';
const BRANCH_A1 = 'branch-a1';
const BRANCH_A2 = 'branch-a2';
const WAREHOUSE_A = 'warehouse-a';
const TERMINAL_A1 = 'terminal-a1';

let environment: RulesTestEnvironment;

function membership(input: {
  vendorId: string;
  userUid: string;
  permissions?: string[];
  assignedWarehouseIds?: string[];
  assignedBranchIds?: string[];
  assignedTerminalIds?: string[];
  status?: string;
}) {
  return {
    tenantId: input.vendorId,
    vendorId: input.vendorId,
    userUid: input.userUid,
    roleId: 'test-role',
    status: input.status ?? 'ACTIVE',
    permissionVersion: 1,
    permissions: input.permissions ?? [],
    assignedWarehouseIds: input.assignedWarehouseIds ?? [],
    assignedBranchIds: input.assignedBranchIds ?? [],
    assignedTerminalIds: input.assignedTerminalIds ?? [],
    effectiveAt: '2026-08-06T00:00:00.000Z',
    createdAt: '2026-08-06T00:00:00.000Z',
    updatedAt: '2026-08-06T00:00:00.000Z',
  };
}

async function seed() {
  await environment.withSecurityRulesDisabled(async context => {
    const firestore = context.firestore();
    await Promise.all([
      setDoc(doc(firestore, 'vendors', VENDOR_A), { id: VENDOR_A, businessName: 'Vendor A' }),
      setDoc(doc(firestore, 'vendors', VENDOR_B), { id: VENDOR_B, businessName: 'Vendor B' }),
      setDoc(doc(firestore, 'vendors', VENDOR_A, 'warehouses', WAREHOUSE_A), {
        id: WAREHOUSE_A, vendorId: VENDOR_A, status: 'active',
      }),
      setDoc(doc(firestore, 'vendors', VENDOR_A, 'branches', BRANCH_A1), {
        id: BRANCH_A1, vendorId: VENDOR_A, status: 'active',
      }),
      setDoc(doc(firestore, 'vendors', VENDOR_A, 'branches', BRANCH_A2), {
        id: BRANCH_A2, vendorId: VENDOR_A, status: 'active',
      }),
      setDoc(doc(firestore, 'vendors', VENDOR_A, 'terminals', TERMINAL_A1), {
        id: TERMINAL_A1, vendorId: VENDOR_A, branchId: BRANCH_A1, status: 'active',
      }),
      setDoc(doc(firestore, 'vendors', VENDOR_B, 'branches', 'branch-b1'), {
        id: 'branch-b1', vendorId: VENDOR_B, status: 'active',
      }),
      setDoc(doc(firestore, 'vendors', VENDOR_A, 'products', 'product-a'), {
        id: 'product-a', vendorId: VENDOR_A, name: 'Product A',
      }),
      setDoc(doc(firestore, 'vendors', VENDOR_B, 'products', 'product-b'), {
        id: 'product-b', vendorId: VENDOR_B, name: 'Product B',
      }),
    ]);

    await Promise.all([
      setDoc(doc(firestore, 'vendors', VENDOR_A, 'memberships', 'owner-a'), membership({
        vendorId: VENDOR_A,
        userUid: 'owner-a',
        permissions: [
          'tenant.manage', 'location.all', 'location.manage', 'product.manage',
          'receiving.create', 'sale.complete', 'bi.view', 'bi.event.create',
          'audit.view', 'audit.event.create', 'staff.manage',
        ],
      })),
      setDoc(doc(firestore, 'vendors', VENDOR_B, 'memberships', 'owner-b'), membership({
        vendorId: VENDOR_B,
        userUid: 'owner-b',
        permissions: ['tenant.manage', 'location.all', 'product.manage'],
      })),
      setDoc(doc(firestore, 'vendors', VENDOR_A, 'memberships', 'branch-staff'), membership({
        vendorId: VENDOR_A,
        userUid: 'branch-staff',
        permissions: ['location.manage', 'product.manage', 'receiving.create', 'sale.complete'],
        assignedBranchIds: [BRANCH_A1],
        assignedTerminalIds: [TERMINAL_A1],
      })),
      setDoc(doc(firestore, 'vendors', VENDOR_A, 'memberships', 'suspended-user'), membership({
        vendorId: VENDOR_A,
        userUid: 'suspended-user',
        status: 'SUSPENDED',
      })),
      setDoc(doc(firestore, 'vendors', VENDOR_A, 'warehouse_inventory', 'balance-a'), {
        id: 'balance-a', vendorId: VENDOR_A, warehouseId: WAREHOUSE_A,
        productId: 'product-a', quantity: 10,
      }),
      setDoc(doc(firestore, 'vendors', VENDOR_A, 'inventory_movements', 'movement-a'), {
        id: 'movement-a', tenantId: VENDOR_A, vendorId: VENDOR_A,
        locationId: WAREHOUSE_A, productId: 'product-a', movementType: 'OPENING_BALANCE',
      }),
      setDoc(doc(firestore, 'vendors', VENDOR_A, 'bi_logs', 'event-a'), {
        id: 'event-a', tenantId: VENDOR_A, vendorId: VENDOR_A,
        eventType: 'TEST_EVENT', outcome: 'COMPLETED',
      }),
      setDoc(doc(firestore, 'vendors', VENDOR_A, 'approval_events', 'audit-a'), {
        id: 'audit-a', tenantId: VENDOR_A, vendorId: VENDOR_A,
        eventType: 'TEST_AUDIT_EVENT', outcome: 'COMPLETED',
      }),
    ]);
  });
}

before(async () => {
  environment = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      host: '127.0.0.1',
      port: 8080,
      rules: readFileSync('firestore.rules', 'utf8'),
    },
  });
});

test('browser cannot forge completed sale, payment, receipt, command, or trusted shift totals', async () => {
  await environment.withSecurityRulesDisabled(async context => { await setDoc(doc(context.firestore(),'vendors',VENDOR_A,'shifts','shift-sale'),{id:'shift-sale',tenantId:VENDOR_A,vendorId:VENDOR_A,branchId:BRANCH_A1,terminalId:TERMINAL_A1,status:'open',totalSales:0,cashSales:0,cardSales:0,mobileSales:0,transactionCount:0}); });
  const db=environment.authenticatedContext('owner-a').firestore();
  await assertFails(setDoc(doc(db,'vendors',VENDOR_A,'orders','forged-sale'),{tenantId:VENDOR_A,vendorId:VENDOR_A,branchId:BRANCH_A1,status:'completed'}));
  await assertFails(setDoc(doc(db,'vendors',VENDOR_A,'payments','forged-payment'),{tenantId:VENDOR_A,vendorId:VENDOR_A,branchId:BRANCH_A1,status:'CONFIRMED'}));
  await assertFails(setDoc(doc(db,'vendors',VENDOR_A,'receipts','forged-receipt'),{tenantId:VENDOR_A,vendorId:VENDOR_A,branchId:BRANCH_A1,saleId:'forged-sale'}));
  await assertFails(setDoc(doc(db,'vendors',VENDOR_A,'sale_commands','forged-command'),{vendorId:VENDOR_A}));
  await assertFails(updateDoc(doc(db,'vendors',VENDOR_A,'shifts','shift-sale'),{totalSales:100,cashSales:100,transactionCount:1}));
});

beforeEach(async () => {
  await environment.clearFirestore();
  await seed();
});

after(async () => {
  await environment.cleanup();
});

test('unauthenticated access is rejected', async () => {
  const firestore = environment.unauthenticatedContext().firestore();
  await assertFails(getDoc(doc(firestore, 'vendors', VENDOR_A)));
  await assertFails(getDoc(doc(firestore, 'vendors', VENDOR_A, 'products', 'product-a')));
});

test('vendor A cannot read or write vendor B resources', async () => {
  const firestore = environment.authenticatedContext('owner-a').firestore();
  await assertFails(getDoc(doc(firestore, 'vendors', VENDOR_B)));
  await assertFails(getDoc(doc(firestore, 'vendors', VENDOR_B, 'products', 'product-b')));
  await assertFails(setDoc(doc(firestore, 'vendors', VENDOR_B, 'products', 'forged'), {
    id: 'forged', vendorId: VENDOR_B, name: 'Forged',
  }));
});

test('branch staff cannot mutate another branch or warehouse-only resources', async () => {
  const firestore = environment.authenticatedContext('branch-staff').firestore();
  await assertFails(updateDoc(doc(firestore, 'vendors', VENDOR_A, 'branches', BRANCH_A2), {
    name: 'Forbidden branch update', vendorId: VENDOR_A, id: BRANCH_A2,
  }));
  await assertFails(setDoc(doc(firestore, 'vendors', VENDOR_A, 'supplier_receipts', 'receipt-a'), {
    id: 'receipt-a', tenantId: VENDOR_A, vendorId: VENDOR_A,
    warehouseId: WAREHOUSE_A,
  }));
});

test('inventory balances cannot be directly written by ordinary clients', async () => {
  const firestore = environment.authenticatedContext('owner-a').firestore();
  await assertFails(setDoc(doc(firestore, 'vendors', VENDOR_A, 'warehouse_inventory', 'balance-new'), {
    id: 'balance-new', vendorId: VENDOR_A, warehouseId: WAREHOUSE_A,
    productId: 'product-a', quantity: 50,
  }));
  await assertFails(updateDoc(doc(firestore, 'vendors', VENDOR_A, 'warehouse_inventory', 'balance-a'), {
    quantity: 500,
  }));
});

test('inventory movements are immutable and cannot be directly created', async () => {
  const firestore = environment.authenticatedContext('owner-a').firestore();
  const movement = doc(firestore, 'vendors', VENDOR_A, 'inventory_movements', 'movement-a');
  await assertFails(updateDoc(movement, { movementType: 'MANUAL_ADJUSTMENT' }));
  await assertFails(deleteDoc(movement));
  await assertFails(setDoc(doc(firestore, 'vendors', VENDOR_A, 'inventory_movements', 'forged'), {
    id: 'forged', tenantId: VENDOR_A, vendorId: VENDOR_A, locationId: WAREHOUSE_A,
  }));
});

test('BI and audit events are append-only', async () => {
  const firestore = environment.authenticatedContext('owner-a').firestore();
  const event = doc(firestore, 'vendors', VENDOR_A, 'bi_logs', 'event-a');
  const audit = doc(firestore, 'vendors', VENDOR_A, 'approval_events', 'audit-a');
  await assertSucceeds(getDoc(event));
  await assertFails(updateDoc(event, { outcome: 'REJECTED' }));
  await assertFails(deleteDoc(event));
  await assertSucceeds(setDoc(doc(firestore, 'vendors', VENDOR_A, 'bi_logs', 'event-new'), {
    id: 'event-new', tenantId: VENDOR_A, vendorId: VENDOR_A,
    eventType: 'TEST_EVENT_CREATED', outcome: 'COMPLETED',
  }));
  await assertSucceeds(getDoc(audit));
  await assertFails(updateDoc(audit, { outcome: 'REJECTED' }));
  await assertFails(deleteDoc(audit));
});

test('permitted users can read only their assigned locations', async () => {
  const owner = environment.authenticatedContext('owner-a').firestore();
  const branchStaff = environment.authenticatedContext('branch-staff').firestore();
  assert.equal((await assertSucceeds(getDoc(doc(owner, 'vendors', VENDOR_A)))).exists(), true);
  assert.equal((await assertSucceeds(getDoc(doc(branchStaff, 'vendors', VENDOR_A, 'branches', BRANCH_A1)))).exists(), true);
  await assertFails(getDoc(doc(branchStaff, 'vendors', VENDOR_A, 'branches', BRANCH_A2)));
  await assertFails(getDoc(doc(branchStaff, 'vendors', VENDOR_A, 'warehouses', WAREHOUSE_A)));
});

test('missing, incomplete, and inactive memberships fail closed', async () => {
  const missing = environment.authenticatedContext('missing-user').firestore();
  const suspended = environment.authenticatedContext('suspended-user').firestore();
  await assertFails(getDoc(doc(missing, 'vendors', VENDOR_A)));
  await assertFails(getDoc(doc(suspended, 'vendors', VENDOR_A)));

  await environment.withSecurityRulesDisabled(async context => {
    await setDoc(doc(context.firestore(), 'vendors', VENDOR_A, 'memberships', 'incomplete-user'), {
      tenantId: VENDOR_A, vendorId: VENDOR_A, userUid: 'incomplete-user', status: 'ACTIVE',
    });
  });
  const incomplete = environment.authenticatedContext('incomplete-user').firestore();
  await assertFails(getDoc(doc(incomplete, 'vendors', VENDOR_A)));
});

test('forged vendor and location identifiers are rejected', async () => {
  const firestore = environment.authenticatedContext('branch-staff').firestore();
  await assertFails(setDoc(doc(firestore, 'vendors', VENDOR_A, 'products', 'wrong-tenant'), {
    id: 'wrong-tenant', vendorId: VENDOR_B, tenantId: VENDOR_B, name: 'Wrong tenant',
  }));
  await assertFails(setDoc(doc(firestore, 'vendors', VENDOR_A, 'sales', 'wrong-location'), {
    id: 'wrong-location', tenantId: VENDOR_A, vendorId: VENDOR_A,
    branchId: BRANCH_A2, totalAmount: 10,
  }));
  await assertFails(setDoc(doc(firestore, 'vendors', VENDOR_A, 'sales', 'foreign-location'), {
    id: 'foreign-location', tenantId: VENDOR_A, vendorId: VENDOR_A,
    branchId: 'branch-b1', totalAmount: 10,
  }));
});

test('browser cannot forge stocktake lifecycle, evidence, posting, reversal, or trusted events', async () => {
  await environment.withSecurityRulesDisabled(async context => {
    const db = context.firestore();
    await setDoc(doc(db, 'vendors', VENDOR_A, 'stocktakes', 'stocktake-a'), { id: 'stocktake-a', stocktakeId: 'stocktake-a', tenantId: VENDOR_A, vendorId: VENDOR_A, locationId: WAREHOUSE_A, stockLocationId: WAREHOUSE_A, locationType: 'WAREHOUSE', status: 'POSTED', approvedVariance: 2 });
    await setDoc(doc(db, 'vendors', VENDOR_A, 'stocktake_count_evidence', 'evidence-a'), { id: 'evidence-a', tenantId: VENDOR_A, vendorId: VENDOR_A, locationId: WAREHOUSE_A, stocktakeId: 'stocktake-a', countedQuantity: 12, varianceQuantity: 2 });
  });
  const db = environment.authenticatedContext('owner-a').firestore();
  await assertSucceeds(getDoc(doc(db, 'vendors', VENDOR_A, 'stocktakes', 'stocktake-a')));
  await assertFails(setDoc(doc(db, 'vendors', VENDOR_A, 'stocktake_commands', 'forged'), { action: 'POST' }));
  await assertFails(updateDoc(doc(db, 'vendors', VENDOR_A, 'stocktakes', 'stocktake-a'), { status: 'REVERSED', approvedVariance: 0 }));
  await assertFails(updateDoc(doc(db, 'vendors', VENDOR_A, 'stocktake_count_evidence', 'evidence-a'), { countedQuantity: 1, varianceQuantity: -9 }));
  await assertFails(setDoc(doc(db, 'vendors', VENDOR_A, 'inventory_movements', 'forged-stocktake'), { tenantId: VENDOR_A, vendorId: VENDOR_A, locationId: WAREHOUSE_A, movementType: 'STOCKTAKE_ADJUSTMENT' }));
  await assertFails(setDoc(doc(db, 'vendors', VENDOR_A, 'inventory_balances', 'forged-balance'), { tenantId: VENDOR_A, vendorId: VENDOR_A, stockLocationId: WAREHOUSE_A, onHandQty: 999 }));
  await assertFails(setDoc(doc(db, 'vendors', VENDOR_A, 'audit_events', 'forged-reversal'), { tenantId: VENDOR_A, vendorId: VENDOR_A, locationId: WAREHOUSE_A, eventType: 'STOCKTAKE_REVERSED' }));
  await assertFails(setDoc(doc(db, 'vendors', VENDOR_A, 'bi_events', 'forged-completion'), { tenantId: VENDOR_A, vendorId: VENDOR_A, locationId: WAREHOUSE_A, eventType: 'STOCKTAKE_ADJUSTMENT_POSTED' }));
});
