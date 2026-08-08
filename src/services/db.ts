import {
  doc,
  getDoc,
  setDoc,
  collection,
  getDocs,
  query,
  where,
  addDoc,
  updateDoc,
  onSnapshot,
  runTransaction,
  writeBatch
  ,deleteDoc
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../lib/firebase';
import {
  VendorProfile,
  Warehouse,
  Branch,
  Terminal,
  Product,
  WarehouseInventory,
  BranchInventory,
  SupplierReceipt,
  StockTransfer,
  StockAdjustment,
  Order,
  StaffMember,
  StaffRole,
  AppMenuId,
  ApprovalRequest,
  ApprovalRequestType,
  HardwareSettings,
  CustomRoleDefinition,
  DeliveryCourier,
  DeliveryDispatchMessage,
  VehicleType,
  TerminalShift,
  BillingPlan,
  BillingServiceAddon,
  VendorSubscription,
  VendorInvoice,
  InvoiceItem,
  ChartOfAccount,
  IssuedCheck,
  AccountType,
  Customer,
  CreditSale,
  CreditSaleItem,
  CreditPayment,
  CollectionActivity,
  ResourceLifecycleStatus,
  ResourceType,
  CriticalInventoryEntityType,
  InventoryApprovalPolicy,
  InventoryWorkflowStatus,
  WorkflowActor,
  ApprovalDataPayload,
  ApprovalQuantityDecision,
  ProductLedgerEntry,
  PurchaseOrder,
  PurchaseOrderItem,
  PurchaseOrderStatus,
  Supplier,
  normalizeProduct
} from '../types';
import { logBIEvent } from '../bi/tracker';
import { createVendorOwnerMembership } from '../auth/tenantMembership';
import {
  completeSaleTransaction,
  SaleCompletionResult,
} from './saleTransaction';
import { createFirestoreAtomicSaleRunner } from '../features/inventory/infrastructure/firestoreSaleInventoryAdapter';
import {
  assertTerminalBelongsToActiveBranch,
  canResourceProcessTransactions,
  ResourceEntitlementService,
} from './resourceEntitlements';
import {
  createPendingInventoryRequest,
  decideInventoryRequest,
  DEFAULT_INVENTORY_APPROVAL_POLICY,
  INVENTORY_WORKFLOW_POLICIES,
  InventoryWorkflowError,
  createIdempotentApprovalRequestId,
  isSupplierReceiptAutoApproved,
  markInventoryRequestCompleted,
  markInventoryRequestProcessing,
} from './inventoryApprovalWorkflow';
import {
  assertReceiptAllowed,
  compareReceiptToPurchaseOrder,
  mergeReceiptLine,
  ReceiptDraftLine,
} from './supplierReceiving';
import {
  addTransferLine,
  assertCanDispatch,
  assertRequestedStockAvailable,
  assertWarehouseToBranchRoute,
  canAccessTransferLedger,
  TransferDraftLine,
  validateTransferReceipt,
} from './stockTransferWorkflow';
import { assertProductPermission, determineProductRemoval, ProductUsageSummary } from './productLifecycle';
import { assertCanonicalProductReference, assertDuplicateDecision, checkProductDuplicates, normalizeHsCode, ProductDuplicateDecisionInput, validateHsCode, assertExtendedProductPermission, effectiveProductTaxRate } from '../features/products';
import { requiresBelowAverageCostApproval } from '../features/inventory/averageCost';

// Helper for local caching/fallback to ensure snappy preview & offline resiliency
const LOCAL_STORAGE_KEY = 'itred_pos_vendor_data_';

const resourceEntitlementService = new ResourceEntitlementService(async event => {
  await logBIEvent(
    event.vendorId,
    event.type,
    `${event.type.replaceAll('_', ' ').toLowerCase()}: ${event.resourceType}${event.resourceId ? ` ${event.resourceId}` : ''}`,
    {
      resourceType: event.resourceType,
      resourceId: event.resourceId,
      planId: event.planId,
      ...event.details,
    },
  );
});

export function getLocalVendor(vendorId: string): VendorProfile | null {
  try {
    const raw = localStorage.getItem(`${LOCAL_STORAGE_KEY}_profile_${vendorId}`);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveLocalVendor(vendorId: string, profile: VendorProfile) {
  try {
    localStorage.setItem(`${LOCAL_STORAGE_KEY}_profile_${vendorId}`, JSON.stringify(profile));
  } catch (e) {
    console.error(e);
  }
}

// Default starter products to make onboarding immediate & functional
const STARTER_PRODUCTS: Omit<Product, 'id' | 'vendorId' | 'createdAt'>[] = [
  {
    sku: 'ITR-001',
    name: 'Standard Thermal POS Paper Roll (80x80)',
    category: 'POS Supplies',
    costPrice: 1.50,
    sellingPrice: 3.50,
    unit: 'roll',
    reorderLevel: 20,
    barcode: '8901001001'
  },
  {
    sku: 'ITR-002',
    name: 'Wireless Bluetooth Barcode Scanner',
    category: 'Hardware',
    costPrice: 28.00,
    sellingPrice: 55.00,
    unit: 'pcs',
    reorderLevel: 5,
    barcode: '8901001002'
  },
  {
    sku: 'ITR-003',
    name: 'Automatic Cash Drawer 4-Bill 5-Coin',
    category: 'Hardware',
    costPrice: 42.00,
    sellingPrice: 89.00,
    unit: 'pcs',
    reorderLevel: 3,
    barcode: '8901001003'
  },
  {
    sku: 'ITR-004',
    name: 'Organic Espresso Coffee Beans (1kg)',
    category: 'Beverages & Pantry',
    costPrice: 9.00,
    sellingPrice: 22.00,
    unit: 'bag',
    reorderLevel: 10,
    barcode: '8901001004'
  },
  {
    sku: 'ITR-005',
    name: 'Eco-Friendly Shopping Bag (Pack of 50)',
    category: 'Packaging',
    costPrice: 4.50,
    sellingPrice: 12.00,
    unit: 'pack',
    reorderLevel: 15,
    barcode: '8901001005'
  }
];

// Fetch Vendor Profile from Firestore with fallback
export async function fetchVendorProfile(vendorId: string): Promise<VendorProfile | null> {
  try {
    const docRef = doc(db, 'vendors', vendorId);
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      const data = snap.data() as VendorProfile;
      saveLocalVendor(vendorId, data);
      return data;
    }
  } catch (err) {
    console.warn('Firestore fetch failed, checking local cache', err);
  }

  const cached = getLocalVendor(vendorId);
  if (cached) return cached;

  return null;
}

// Create or Onboard Vendor Profile
export async function onboardVendor(
  vendorId: string,
  email: string,
  details: { businessName: string; address: string; phone: string }
): Promise<{
  profile: VendorProfile;
  warehouse: Warehouse;
  branch: Branch;
  terminal: Terminal;
}> {
  const now = new Date().toISOString();
  
  const profile: VendorProfile = {
    id: vendorId,
    email,
    businessName: details.businessName,
    address: details.address,
    phone: details.phone,
    createdAt: now,
    updatedAt: now,
    currency: '$',
    taxRate: 8,
    onboardingCompleted: true,
  };

  // 1. Default Warehouse
  const warehouse: Warehouse = {
    id: `wh_${vendorId}_default`,
    vendorId,
    name: `${details.businessName} Central Warehouse`,
    code: 'WH-01',
    location: details.address || 'Central HQ',
    isDefault: true,
    licenseStatus: 'licensed',
    status: 'active',
    createdAt: now,
  };

  // 2. Default Branch
  const branch: Branch = {
    id: `br_${vendorId}_default`,
    vendorId,
    name: `${details.businessName} Main Branch`,
    code: 'BR-01',
    address: details.address || 'Main St',
    phone: details.phone || '',
    isDefault: true,
    licenseStatus: 'licensed',
    status: 'active',
    createdAt: now,
  };

  // 3. Default Terminal in Branch
  const terminal: Terminal = {
    id: `term_${vendorId}_default`,
    vendorId,
    branchId: branch.id,
    name: 'Terminal 01',
    code: 'TERM-01',
    isDefault: true,
    licenseStatus: 'licensed',
    status: 'active',
    createdAt: now,
  };
  const ownerMembership = createVendorOwnerMembership(vendorId, vendorId, now);
  ownerMembership.assignedWarehouseIds = [warehouse.id];
  ownerMembership.assignedBranchIds = [branch.id];
  ownerMembership.assignedTerminalIds = [terminal.id];

  // Cache locally
  saveLocalVendor(vendorId, profile);
  try {
    localStorage.setItem(`${LOCAL_STORAGE_KEY}_wh_${vendorId}`, JSON.stringify([warehouse]));
    localStorage.setItem(`${LOCAL_STORAGE_KEY}_br_${vendorId}`, JSON.stringify([branch]));
    localStorage.setItem(`${LOCAL_STORAGE_KEY}_term_${vendorId}`, JSON.stringify([terminal]));
  } catch (e) {
    console.error(e);
  }

  // Save to Firestore
  try {
    // Membership is the tenant authority. The rules allow this single owner
    // bootstrap only while the UID-named vendor document does not yet exist.
    await setDoc(doc(db, 'vendors', vendorId, 'memberships', vendorId), ownerMembership);
    await setDoc(doc(db, 'vendors', vendorId), profile);
    await setDoc(doc(db, 'vendors', vendorId, 'warehouses', warehouse.id), warehouse);
    await setDoc(doc(db, 'vendors', vendorId, 'branches', branch.id), branch);
    await setDoc(doc(db, 'vendors', vendorId, 'terminals', terminal.id), terminal);

    // Seed initial catalog products
    for (const p of STARTER_PRODUCTS) {
      const pId = `prod_${Math.random().toString(36).substring(2, 9)}`;
      const newProd: Product = {
        ...p,
        id: pId,
        vendorId,
        createdAt: now,
      };
      await setDoc(doc(db, 'vendors', vendorId, 'products', pId), newProd);

      // Seed initial warehouse inventory (e.g. 100 units central stock)
      const whInvId = `${vendorId}_${warehouse.id}_${pId}`;
      const whInv: WarehouseInventory = {
        id: whInvId,
        vendorId,
        warehouseId: warehouse.id,
        productId: pId,
        quantity: 100,
        lastUpdated: now,
      };
      await setDoc(doc(db, 'vendors', vendorId, 'warehouse_inventory', whInvId), whInv);

      // Seed initial branch inventory via initial opening balance transfer simulation
      const brInvId = `${vendorId}_${branch.id}_${pId}`;
      const brInv: BranchInventory = {
        id: brInvId,
        vendorId,
        branchId: branch.id,
        productId: pId,
        quantity: 25,
        lastUpdated: now,
      };
      await setDoc(doc(db, 'vendors', vendorId, 'branch_inventory', brInvId), brInv);
    }
  } catch (err) {
    console.warn('Firestore write during onboarding had notice (continuing locally):', err);
  }

  return { profile, warehouse, branch, terminal };
}

// Fetch Warehouses
export async function fetchWarehouses(vendorId: string): Promise<Warehouse[]> {
  try {
    const colRef = collection(db, 'vendors', vendorId, 'warehouses');
    const snap = await getDocs(colRef);
    if (!snap.empty) {
      return snap.docs.map(d => d.data() as Warehouse);
    }
  } catch (e) {
    console.warn(e);
  }
  const raw = localStorage.getItem(`${LOCAL_STORAGE_KEY}_wh_${vendorId}`);
  return raw ? JSON.parse(raw) : [
    {
      id: `wh_${vendorId}_default`,
      vendorId,
      name: 'Central Warehouse',
      code: 'WH-01',
      location: 'Main HQ',
      isDefault: true,
      licenseStatus: 'licensed',
      status: 'active',
      createdAt: new Date().toISOString()
    }
  ];
}

// Fetch Branches
export async function fetchBranches(vendorId: string): Promise<Branch[]> {
  try {
    const colRef = collection(db, 'vendors', vendorId, 'branches');
    const snap = await getDocs(colRef);
    if (!snap.empty) {
      return snap.docs.map(d => d.data() as Branch);
    }
  } catch (e) {
    console.warn(e);
  }
  const raw = localStorage.getItem(`${LOCAL_STORAGE_KEY}_br_${vendorId}`);
  return raw ? JSON.parse(raw) : [
    {
      id: `br_${vendorId}_default`,
      vendorId,
      name: 'Main Branch',
      code: 'BR-01',
      address: 'Main Store',
      phone: '555-0199',
      isDefault: true,
      licenseStatus: 'licensed',
      status: 'active',
      createdAt: new Date().toISOString()
    }
  ];
}

async function getResourceEntitlementContext(vendorId: string, resourceType: ResourceType) {
  const [subscription, plans, resources] = await Promise.all([
    fetchVendorSubscription(vendorId),
    fetchBillingPlans(),
    resourceType === 'warehouse'
      ? fetchWarehouses(vendorId)
      : resourceType === 'branch'
        ? fetchBranches(vendorId)
        : fetchTerminals(vendorId),
  ]);
  const plan =
    plans.find(candidate => candidate.id === subscription.planId && candidate.status === 'active') ||
    DEFAULT_BILLING_PLANS.find(candidate => candidate.id === 'starter_free')!;

  return { subscription, plan, resources };
}

async function requireResourceActivationEntitlement(
  vendorId: string,
  resourceType: ResourceType,
) {
  const context = await getResourceEntitlementContext(vendorId, resourceType);
  await resourceEntitlementService.checkActivation({
    vendorId,
    resourceType,
    plan: context.plan,
    subscription: context.subscription,
    resources: context.resources,
  });
  return context;
}

async function requireActiveOperationalResource(
  vendorId: string,
  resourceType: Extract<ResourceType, 'warehouse' | 'branch'>,
  resourceId: string,
): Promise<void> {
  const resources = resourceType === 'warehouse'
    ? await fetchWarehouses(vendorId)
    : await fetchBranches(vendorId);
  const resource = resources.find(candidate => candidate.id === resourceId);
  if (!resource || resource.vendorId !== vendorId || !canResourceProcessTransactions(resource)) {
    throw new Error(`The selected ${resourceType} is suspended, archived, unlicensed, or unavailable.`);
  }
}

// Add New Warehouse
export async function createWarehouse(
  vendorId: string,
  name: string,
  location: string,
): Promise<Warehouse> {
  const { plan } = await requireResourceActivationEntitlement(vendorId, 'warehouse');
  const now = new Date().toISOString();
  const current = await fetchWarehouses(vendorId);
  const id = `wh_${vendorId}_${Math.random().toString(36).substring(2, 7)}`;
  const warehouse: Warehouse = {
    id,
    vendorId,
    name,
    code: `WH-${String(current.length + 1).padStart(2, '0')}`,
    location,
    isDefault: false,
    licenseStatus: 'licensed',
    status: 'active',
    createdAt: now,
  };

  await setDoc(doc(db, 'vendors', vendorId, 'warehouses', id), warehouse);
  localStorage.setItem(
    `${LOCAL_STORAGE_KEY}_wh_${vendorId}`,
    JSON.stringify([...current, warehouse]),
  );
  await resourceEntitlementService.recordActivationApproved(vendorId, 'warehouse', id, plan.id);
  return warehouse;
}

// Add New Branch
export async function createBranch(vendorId: string, name: string, address: string, phone: string): Promise<Branch> {
  const { plan } = await requireResourceActivationEntitlement(vendorId, 'branch');
  const now = new Date().toISOString();
  const id = `br_${vendorId}_${Math.random().toString(36).substring(2, 7)}`;
  const count = (await fetchBranches(vendorId)).length + 1;
  const newBranch: Branch = {
    id,
    vendorId,
    name,
    code: `BR-0${count}`,
    address,
    phone,
    isDefault: false,
    licenseStatus: 'licensed',
    status: 'active',
    createdAt: now,
  };

  await setDoc(doc(db, 'vendors', vendorId, 'branches', id), newBranch);

  // Update local
  const current = await fetchBranches(vendorId);
  const updated = [...current, newBranch];
  localStorage.setItem(`${LOCAL_STORAGE_KEY}_br_${vendorId}`, JSON.stringify(updated));

  await resourceEntitlementService.recordActivationApproved(vendorId, 'branch', id, plan.id);
  return newBranch;
}

// Fetch Terminals
export async function fetchTerminals(vendorId: string, branchId?: string): Promise<Terminal[]> {
  try {
    const colRef = collection(db, 'vendors', vendorId, 'terminals');
    const snap = await getDocs(colRef);
    if (!snap.empty) {
      let list = snap.docs.map(d => d.data() as Terminal);
      if (branchId) {
        list = list.filter(t => t.branchId === branchId);
      }
      return list;
    }
  } catch (e) {
    console.warn(e);
  }
  const raw = localStorage.getItem(`${LOCAL_STORAGE_KEY}_term_${vendorId}`);
  const list: Terminal[] = raw ? JSON.parse(raw) : [
    {
      id: `term_${vendorId}_default`,
      vendorId,
      branchId: branchId || `br_${vendorId}_default`,
      name: 'Terminal 01',
      code: 'TERM-01',
      isDefault: true,
      licenseStatus: 'licensed',
      status: 'active',
      createdAt: new Date().toISOString()
    }
  ];
  return branchId ? list.filter(t => t.branchId === branchId) : list;
}

// Add New Terminal
export async function createTerminal(vendorId: string, branchId: string, name: string): Promise<Terminal> {
  const branches = await fetchBranches(vendorId);
  assertTerminalBelongsToActiveBranch(branchId, branches);
  const { plan } = await requireResourceActivationEntitlement(vendorId, 'terminal');
  const now = new Date().toISOString();
  const id = `term_${vendorId}_${Math.random().toString(36).substring(2, 7)}`;
  const count = (await fetchTerminals(vendorId, branchId)).length + 1;
  const newTerm: Terminal = {
    id,
    vendorId,
    branchId,
    name,
    code: `TERM-0${count}`,
    isDefault: count === 1,
    licenseStatus: 'licensed',
    status: 'active',
    createdAt: now,
  };

  await setDoc(doc(db, 'vendors', vendorId, 'terminals', id), newTerm);

  const current = await fetchTerminals(vendorId);
  localStorage.setItem(`${LOCAL_STORAGE_KEY}_term_${vendorId}`, JSON.stringify([...current, newTerm]));

  await resourceEntitlementService.recordActivationApproved(vendorId, 'terminal', id, plan.id);
  return newTerm;
}

function resourceCollection(resourceType: ResourceType): 'warehouses' | 'branches' | 'terminals' {
  if (resourceType === 'warehouse') return 'warehouses';
  if (resourceType === 'branch') return 'branches';
  return 'terminals';
}

function resourceLocalStorageKey(resourceType: ResourceType, vendorId: string): string {
  if (resourceType === 'warehouse') return `${LOCAL_STORAGE_KEY}_wh_${vendorId}`;
  if (resourceType === 'branch') return `${LOCAL_STORAGE_KEY}_br_${vendorId}`;
  return `${LOCAL_STORAGE_KEY}_term_${vendorId}`;
}

export async function updateResourceLifecycleStatus(
  vendorId: string,
  resourceType: ResourceType,
  resourceId: string,
  status: ResourceLifecycleStatus,
): Promise<void> {
  const context = await getResourceEntitlementContext(vendorId, resourceType);
  const resource = context.resources.find(candidate => candidate.id === resourceId);
  if (!resource) throw new Error(`The selected ${resourceType} does not exist.`);
  if (resource.status === 'archived') throw new Error('Archived resources cannot be reactivated or modified.');

  if (status === 'active') {
    await resourceEntitlementService.checkActivation({
      vendorId,
      resourceType,
      plan: context.plan,
      subscription: context.subscription,
      resources: context.resources.filter(candidate => candidate.id !== resourceId),
    });
  }

  const affectedTerminals = resourceType === 'branch' && status !== 'active'
    ? (await fetchTerminals(vendorId)).filter(
        terminal => terminal.branchId === resourceId && terminal.status !== 'archived',
      )
    : [];
  const nextLicenseStatus = status === 'active'
    ? 'licensed'
    : resource.licenseStatus || 'licensed';
  const batch = writeBatch(db);
  batch.set(
    doc(db, 'vendors', vendorId, resourceCollection(resourceType), resourceId),
    { status, licenseStatus: nextLicenseStatus },
    { merge: true },
  );
  for (const terminal of affectedTerminals) {
    batch.set(
      doc(db, 'vendors', vendorId, 'terminals', terminal.id),
      { status, licenseStatus: terminal.licenseStatus || 'licensed' },
      { merge: true },
    );
  }
  await batch.commit();

  const updatedResources = context.resources.map(candidate =>
    candidate.id === resourceId
      ? { ...candidate, status, licenseStatus: nextLicenseStatus }
      : candidate,
  );
  localStorage.setItem(
    resourceLocalStorageKey(resourceType, vendorId),
    JSON.stringify(updatedResources),
  );

  if (resourceType === 'branch' && status !== 'active') {
    const terminals = await fetchTerminals(vendorId);
    await Promise.all(affectedTerminals.map(terminal =>
      resourceEntitlementService.recordLifecycleChange(
        vendorId,
        'terminal',
        terminal.id,
        status,
      ),
    ));
    if (affectedTerminals.length > 0) {
      const affectedIds = new Set(affectedTerminals.map(terminal => terminal.id));
      const updatedTerminals = terminals.map(terminal =>
        affectedIds.has(terminal.id)
          ? { ...terminal, status, licenseStatus: terminal.licenseStatus || 'licensed' }
          : terminal,
      );
      localStorage.setItem(
        resourceLocalStorageKey('terminal', vendorId),
        JSON.stringify(updatedTerminals),
      );
    }
  }

  if (status === 'active') {
    await resourceEntitlementService.recordActivationApproved(
      vendorId,
      resourceType,
      resourceId,
      context.plan.id,
    );
  } else {
    await resourceEntitlementService.recordLifecycleChange(vendorId, resourceType, resourceId, status);
  }
}

// Fetch Products
export async function fetchProducts(vendorId: string): Promise<Product[]> {
  try {
    const colRef = collection(db, 'vendors', vendorId, 'products');
    const snap = await getDocs(colRef);
    if (!snap.empty) {
      return snap.docs.map(d => normalizeProduct(d.data() as Product));
    }
  } catch (e) {
    console.warn(e);
  }
  const raw = localStorage.getItem(`${LOCAL_STORAGE_KEY}_products_${vendorId}`);
  if (raw) return (JSON.parse(raw) as Product[]).map(normalizeProduct);
  
  // Return default starter list
  const now = new Date().toISOString();
  const initial = STARTER_PRODUCTS.map((p, idx) => normalizeProduct({
    ...p,
    id: `prod_default_${idx}`,
    vendorId,
    createdAt: now,
  }));
  localStorage.setItem(`${LOCAL_STORAGE_KEY}_products_${vendorId}`, JSON.stringify(initial));
  return initial;
}

export interface ProductSaveOptions {
  actor: WorkflowActor;
  vendorTaxRate: number;
  duplicateDecision?: ProductDuplicateDecisionInput;
}

export interface InventoryCostSnapshot { productId: string; quantity: number; averageUnitCost: number; stockValue: number; }

export async function fetchInventoryCostSnapshots(vendorId: string): Promise<Record<string, InventoryCostSnapshot>> {
  const [products, warehouse, branch] = await Promise.all([fetchProducts(vendorId), getDocs(collection(db, 'vendors', vendorId, 'warehouse_inventory')), getDocs(collection(db, 'vendors', vendorId, 'branch_inventory'))]);
  const fallback = new Map(products.map(product => [product.id, product.costPrice]));
  const values: Record<string, InventoryCostSnapshot> = {};
  for (const snapshot of [...warehouse.docs, ...branch.docs]) {
    const data = snapshot.data(); const productId = String(data.productId || ''); const quantity = Math.max(0, Number(data.quantity || 0));
    if (!productId || !quantity) continue;
    const unitCost = Number(data.averageUnitCost ?? fallback.get(productId) ?? 0);
    const current = values[productId] || { productId, quantity: 0, averageUnitCost: 0, stockValue: 0 };
    current.quantity += quantity; current.stockValue += quantity * unitCost; current.averageUnitCost = current.stockValue / current.quantity; values[productId] = current;
  }
  return values;
}

export async function requestBelowAverageCostChange(vendorId: string, product: Product, proposedCost: number, averageCost: number, requester: WorkflowActor): Promise<ApprovalRequest> {
  if (!requiresBelowAverageCostApproval(proposedCost, averageCost)) throw new Error('Escalation is only required when proposed cost is below average stock cost.');
  const request = await createApprovalRequest(vendorId, { entityType: 'PRODUCT_COST_CHANGE', entityId: product.id, idempotencyKey: `product-cost:${product.id}:${proposedCost}:${averageCost}`, title: `Below-average cost change · ${product.sku}`, description: `Proposed cost ${proposedCost.toFixed(2)} is below weighted stock average ${averageCost.toFixed(2)} and requires management review.`, requester, dataPayload: { productId: product.id, productName: product.name, sku: product.sku, previousCost: product.costPrice, proposedCost, averageCost, variance: proposedCost - averageCost, inventoryChanged: false } });
  await logBIEvent(vendorId, 'PRODUCT_COST_BELOW_AVERAGE_ESCALATED', `Below-average cost submitted for ${product.sku}`, { productId: product.id, previousCost: product.costPrice, proposedCost, averageCost, variance: proposedCost - averageCost, approvalRequestId: request.id }, { staffId: requester.id, staffName: requester.name, staffRole: requester.role });
  return request;
}

// Save or Update Product through canonical validation, permission and duplicate controls.
export async function saveProduct(vendorId: string, product: Partial<Product>, options: ProductSaveOptions): Promise<Product> {
  const now = new Date().toISOString();
  const id = product.id || `prod_${Math.random().toString(36).substring(2, 9)}`;
  assertExtendedProductPermission(options.actor.role, product.id ? 'product.update' : 'product.create');
  if (!product.sku?.trim() || !product.name?.trim() || !product.category?.trim() || !(product.unitOfMeasure || product.unit)?.trim() || !product.productType) {
    throw new Error('SKU, product name, category, unit of measure and product type are required.');
  }
  if (!product.sector) throw new Error('Industrial sector is required.');
  const hsError = validateHsCode(product.hsCode || '');
  if (hsError) throw new Error(hsError);
  const current = await fetchProducts(vendorId);
  const existing = current.find(item => item.id === id);
  if ((product.hsCode || '') !== (existing?.hsCode || '')) assertExtendedProductPermission(options.actor.role, 'product.hs_code.edit');
  if (existing && product.taxOption !== existing.taxOption) assertExtendedProductPermission(options.actor.role, 'product.tax.edit');
  if (!existing && product.taxOption && product.taxOption !== 'STANDARD_RATED') assertExtendedProductPermission(options.actor.role, 'product.tax.edit');
  const candidate: Partial<Product> = { ...existing, ...product, id, vendorId };
  const duplicateMatches = checkProductDuplicates(candidate, current);
  await logBIEvent(vendorId, 'PRODUCT_DUPLICATE_CHECKED', `Duplicate check completed for ${product.sku}`, { productId: id, outcome: duplicateMatches.length ? 'matches_found' : 'clear', duplicateConfidence: duplicateMatches[0]?.confidence || 0, reasonCodes: duplicateMatches.flatMap(match => match.reasons) }, { staffId: options.actor.id, staffName: options.actor.name, staffRole: options.actor.role });
  if (duplicateMatches.length) {
    await logBIEvent(vendorId, 'PRODUCT_DUPLICATE_DETECTED', `Possible duplicate detected for ${product.sku}`, { productId: id, existingProductIds: duplicateMatches.map(match => match.product.id), duplicateConfidence: duplicateMatches[0].confidence, reasonCodes: duplicateMatches.flatMap(match => match.reasons), outcome: 'review_required' }, { staffId: options.actor.id, staffName: options.actor.name, staffRole: options.actor.role });
  }
  assertDuplicateDecision(duplicateMatches, options.duplicateDecision, options.actor.role);
  if (duplicateMatches.length && options.duplicateDecision) {
    await logBIEvent(vendorId, 'PRODUCT_DUPLICATE_DECISION_RECORDED', `Duplicate decision recorded for ${product.sku}`, { productId: id, decision: options.duplicateDecision.decision, duplicateConfidence: duplicateMatches[0].confidence, outcome: 'confirmed_separate' }, { staffId: options.actor.id, staffName: options.actor.name, staffRole: options.actor.role });
    await logBIEvent(vendorId, 'PRODUCT_DUPLICATE_OVERRIDE', `Possible duplicate override recorded for ${product.sku}`, { productId: id, decision: options.duplicateDecision.decision, reasonCode: 'AUTHORIZED_SEPARATE_PRODUCT', outcome: 'overridden' }, { staffId: options.actor.id, staffName: options.actor.name, staffRole: options.actor.role });
  }
  const taxOption = product.taxOption || existing?.taxOption || 'STANDARD_RATED';
  const fullProduct: Product = normalizeProduct({
    ...existing,
    ...product,
    id,
    vendorId,
    sku: product.sku.trim(),
    name: product.name.trim(),
    category: product.category.trim(),
    description: product.description || '',
    size: product.size,
    costPrice: Number(product.costPrice),
    sellingPrice: Number(product.sellingPrice),
    branchPrices: Object.fromEntries(Object.entries(product.branchPrices || {}).filter(([, price]) => Number.isFinite(Number(price)) && Number(price) >= 0).map(([branchId, price]) => [branchId, Number(price)])),
    barcode: product.barcode,
    alternativeLookupCode: product.alternativeLookupCode,
    productType: product.productType,
    sector: product.sector,
    sectorAttributes: product.sectorAttributes || {},
    hsCode: normalizeHsCode(product.hsCode || ''),
    taxOption,
    applicableTaxRate: effectiveProductTaxRate(taxOption, options.vendorTaxRate),
    taxCode: product.taxCode,
    taxCategory: product.taxCategory,
    primarySupplierId: product.primarySupplierId,
    primarySupplierName: product.primarySupplierName,
    brand: product.brand,
    manufacturer: product.manufacturer,
    shelfCode: product.shelfCode || product.shelf,
    shelf: product.shelfCode || product.shelf,
    binCode: product.binCode || product.bin,
    bin: product.binCode || product.bin,
    location: product.location,
    unitOfMeasure: (product.unitOfMeasure || product.unit)!.trim(),
    unit: (product.unitOfMeasure || product.unit)!.trim(),
    reorderLevel: Number(product.reorderLevel),
    status: product.status || 'active',
    createdAt: product.createdAt || now,
    updatedAt: now,
  });

  try {
    await setDoc(doc(db, 'vendors', vendorId, 'products', id), fullProduct);
  } catch (e) {
    console.warn(e);
  }

  const idx = current.findIndex(p => p.id === id);
  let updated: Product[];
  if (idx >= 0) {
    updated = [...current];
    updated[idx] = fullProduct;
  } else {
    updated = [fullProduct, ...current];
  }
  localStorage.setItem(`${LOCAL_STORAGE_KEY}_products_${vendorId}`, JSON.stringify(updated));

  if ((existing?.taxOption || 'STANDARD_RATED') !== fullProduct.taxOption) {
    await logBIEvent(vendorId, 'PRODUCT_TAX_OPTION_UPDATED', `Product tax classification updated for ${fullProduct.sku}`, { productId: id, taxOption: fullProduct.taxOption, applicableTaxRate: fullProduct.applicableTaxRate, outcome: 'updated' }, { staffId: options.actor.id, staffName: options.actor.name, staffRole: options.actor.role });
  }
  if ((existing?.hsCode || '') !== (fullProduct.hsCode || '')) {
    await logBIEvent(vendorId, 'PRODUCT_HS_CODE_UPDATED', `Product HS classification updated for ${fullProduct.sku}`, { productId: id, hsCodePresent: Boolean(fullProduct.hsCode), outcome: 'updated' }, { staffId: options.actor.id, staffName: options.actor.name, staffRole: options.actor.role });
  }
  if (existing && (existing.costPrice !== fullProduct.costPrice || existing.sellingPrice !== fullProduct.sellingPrice || JSON.stringify(existing.branchPrices || {}) !== JSON.stringify(fullProduct.branchPrices || {}))) {
    await logBIEvent(vendorId, 'PRODUCT_PRICE_CHANGED', `Product pricing changed for ${fullProduct.sku}`, { productId: id, sku: fullProduct.sku, previousCost: existing.costPrice, newCost: fullProduct.costPrice, previousSellingPrice: existing.sellingPrice, newSellingPrice: fullProduct.sellingPrice, previousBranchPrices: existing.branchPrices || {}, newBranchPrices: fullProduct.branchPrices || {}, effectiveAt: now }, { staffId: options.actor.id, staffName: options.actor.name, staffRole: options.actor.role });
  }

  return fullProduct;
}

// Bulk Import Products & Stock Adjustments
export async function bulkImportProducts(
  vendorId: string,
  newProducts: Partial<Product>[],
  options: ProductSaveOptions,
): Promise<{ createdProducts: Product[] }> {
  const now = new Date().toISOString();
  const createdProducts: Product[] = [];

  for (const item of newProducts) {
    const id = item.id || `prod_${Math.random().toString(36).substring(2, 9)}`;
    const fullProd = await saveProduct(vendorId, { ...item, id, createdAt: now }, options);
    createdProducts.push(fullProd);
  }

  return { createdProducts };
}

export async function inspectProductUsage(vendorId: string, productId: string): Promise<ProductUsageSummary> {
  const stockByLocation: ProductUsageSummary['stockByLocation'] = [];
  const references: string[] = [];
  const collections = ['warehouse_inventory', 'branch_inventory', 'inventory_movements', 'orders', 'purchase_orders', 'supplier_receipts', 'transfers', 'adjustments', 'approval_requests'];
  await Promise.all(collections.map(async collectionName => {
    const snapshot = await getDocs(collection(db, 'vendors', vendorId, collectionName));
    snapshot.docs.forEach(entry => {
      const value = entry.data() as Record<string, unknown>;
      if (!JSON.stringify(value).includes(productId)) return;
      if (collectionName.endsWith('_inventory')) {
        const quantity = Number(value.quantity || 0);
        stockByLocation.push({ locationId: String(value.warehouseId || value.branchId || ''), locationName: String(value.warehouseId || value.branchId || ''), quantity });
      } else references.push(collectionName);
    });
  }));
  return { stockByLocation, references: [...new Set(references)] };
}

export async function archiveOrDeleteProduct(vendorId: string, product: Product, actor: WorkflowActor): Promise<'delete' | 'archive'> {
  const usage = await inspectProductUsage(vendorId, product.id);
  const outcome = determineProductRemoval(product, usage);
  assertProductPermission(actor.role, outcome === 'delete' ? 'product.delete' : 'product.archive');
  if (outcome === 'delete') {
    await deleteDoc(doc(db, 'vendors', vendorId, 'products', product.id));
  } else {
    await setDoc(doc(db, 'vendors', vendorId, 'products', product.id), { status: 'archived', updatedAt: new Date().toISOString() }, { merge: true });
  }
  const products = (await fetchProducts(vendorId)).filter(item => outcome !== 'delete' || item.id !== product.id).map(item => item.id === product.id ? { ...item, status: 'archived' as const } : item);
  localStorage.setItem(`${LOCAL_STORAGE_KEY}_products_${vendorId}`, JSON.stringify(products));
  await logBIEvent(vendorId, outcome === 'delete' ? 'PRODUCT_DELETED' : 'PRODUCT_ARCHIVED', `${outcome} product ${product.sku}`, { productId: product.id, sku: product.sku, outcome }, { staffId: actor.id, staffName: actor.name, staffRole: actor.role });
  return outcome;
}

export async function restoreProduct(vendorId: string, product: Product, actor: WorkflowActor): Promise<void> {
  assertProductPermission(actor.role, 'product.restore');
  await setDoc(doc(db, 'vendors', vendorId, 'products', product.id), { status: 'active', updatedAt: new Date().toISOString() }, { merge: true });
  const products = (await fetchProducts(vendorId)).map(item => item.id === product.id ? { ...item, status: 'active' as const } : item);
  localStorage.setItem(`${LOCAL_STORAGE_KEY}_products_${vendorId}`, JSON.stringify(products));
  await logBIEvent(vendorId, 'PRODUCT_RESTORED', `restored product ${product.sku}`, { productId: product.id, sku: product.sku, outcome: 'restored' }, { staffId: actor.id, staffName: actor.name, staffRole: actor.role });
}

// Warehouse Inventory Fetch
export async function fetchWarehouseStock(vendorId: string, warehouseId: string): Promise<Record<string, number>> {
  const stockMap: Record<string, number> = {};
  try {
    const colRef = collection(db, 'vendors', vendorId, 'warehouse_inventory');
    const snap = await getDocs(colRef);
    if (!snap.empty) {
      snap.docs.forEach(d => {
        const data = d.data() as WarehouseInventory;
        if (data.warehouseId === warehouseId) {
          stockMap[data.productId] = data.quantity;
        }
      });
      return stockMap;
    }
  } catch (e) {
    console.warn(e);
  }

  const raw = localStorage.getItem(`${LOCAL_STORAGE_KEY}_wh_stock_${vendorId}_${warehouseId}`);
  if (raw) return JSON.parse(raw);

  // default fallback stock
  const prods = await fetchProducts(vendorId);
  prods.forEach(p => { stockMap[p.id] = 100; });
  localStorage.setItem(`${LOCAL_STORAGE_KEY}_wh_stock_${vendorId}_${warehouseId}`, JSON.stringify(stockMap));
  return stockMap;
}

// Branch Inventory Fetch
export async function fetchBranchStock(vendorId: string, branchId: string): Promise<Record<string, number>> {
  const stockMap: Record<string, number> = {};
  try {
    const colRef = collection(db, 'vendors', vendorId, 'branch_inventory');
    const snap = await getDocs(colRef);
    if (!snap.empty) {
      snap.docs.forEach(d => {
        const data = d.data() as BranchInventory;
        if (data.branchId === branchId) {
          stockMap[data.productId] = data.quantity;
        }
      });
      return stockMap;
    }
  } catch (e) {
    console.warn(e);
  }

  const raw = localStorage.getItem(`${LOCAL_STORAGE_KEY}_br_stock_${vendorId}_${branchId}`);
  if (raw) return JSON.parse(raw);

  const prods = await fetchProducts(vendorId);
  prods.forEach(p => { stockMap[p.id] = 25; });
  localStorage.setItem(`${LOCAL_STORAGE_KEY}_br_stock_${vendorId}_${branchId}`, JSON.stringify(stockMap));
  return stockMap;
}

// 1. Supplier Stock Reception: EXCLUSIVELY into Warehouse! (Strict Business Rule)
export async function receiveSupplierStock(
  vendorId: string,
  warehouseId: string,
  supplierId: string,
  supplierName: string,
  referenceNo: string,
  items: ReceiptDraftLine[],
  notes: string | undefined,
  requester: WorkflowActor,
  purchaseOrder?: PurchaseOrder,
  overReceiptException?: { requested: boolean; reason?: string },
): Promise<ApprovalRequest> {
  await requireActiveOperationalResource(vendorId, 'warehouse', warehouseId);
  const mergedItems = items.reduce<ReceiptDraftLine[]>(
    (current, item) => mergeReceiptLine(current, item),
    [],
  );
  const comparisons = compareReceiptToPurchaseOrder(mergedItems, purchaseOrder);
  assertReceiptAllowed('warehouse', comparisons, Boolean(overReceiptException?.requested));
  if (
    overReceiptException?.requested &&
    comparisons.some(item => item.status === 'OVER_RECEIPT') &&
    !overReceiptException.reason?.trim()
  ) {
    throw new Error('Provide a reason for the over-receipt exception request.');
  }
  const receiptId = `rec_${Math.random().toString(36).substring(2, 9)}`;
  const warehouse = (await fetchWarehouses(vendorId)).find(candidate => candidate.id === warehouseId);
  const request = await createApprovalRequest(vendorId, {
    entityType: 'SUPPLIER_STOCK_RECEIPT',
    entityId: receiptId,
    title: `Supplier stock receipt ${referenceNo}`,
    description: `${items.length} supplier item${items.length === 1 ? '' : 's'} submitted for warehouse receipt approval.${overReceiptException?.requested ? ' Includes an over-receipt exception request.' : ''}`,
    requester,
    warehouseId,
    warehouseName: warehouse?.name,
    dataPayload: {
      locationType: 'warehouse',
      locationId: warehouseId,
      supplierId,
      supplierName,
      referenceNo,
      purchaseOrderId: purchaseOrder?.id,
      purchaseOrderNumber: purchaseOrder?.orderNumber,
      overReceiptExceptionRequested: Boolean(overReceiptException?.requested),
      overReceiptReason: overReceiptException?.reason?.trim(),
      notes,
      items: comparisons,
    },
  });
  const policy = await fetchInventoryApprovalPolicy(vendorId);
  if (!overReceiptException?.requested && isSupplierReceiptAutoApproved(requester, policy)) {
    return reviewApprovalRequest(
      vendorId,
      request.id,
      'APPROVED',
      { id: 'policy:auto_supplier_receipt', name: `Auto-approval policy (${requester.role})`, role: 'sysadmin' },
      request.version,
      `Auto-approved by active ${requester.role} supplier receipt policy.`,
    );
  }
  return request;
}

function normalizePurchaseOrder(
  vendorId: string,
  id: string,
  data: Record<string, unknown>,
): PurchaseOrder {
  const rawItems = Array.isArray(data.items) ? data.items : [];
  const items: PurchaseOrderItem[] = rawItems.map(raw => {
    const item = raw as Record<string, unknown>;
    return {
      productId: String(item.productId || ''),
      productName: String(item.productName || item.name || 'Unknown product'),
      sku: item.sku ? String(item.sku) : undefined,
      orderedQuantity: Number(item.orderedQuantity ?? item.quantity ?? 0),
      receivedQuantity: Number(item.receivedQuantity ?? item.quantityReceived ?? 0),
      unitCost: Number(item.unitCost ?? item.costPrice ?? 0),
      unitOfMeasure: item.unitOfMeasure ? String(item.unitOfMeasure) : undefined,
      batchNumber: item.batchNumber ? String(item.batchNumber) : undefined,
    };
  });
  const rawStatus = String(data.status || 'OPEN').toUpperCase();
  const status: PurchaseOrderStatus =
    rawStatus === 'PARTIALLY_RECEIVED' ||
    rawStatus === 'COMPLETED' ||
    rawStatus === 'CANCELLED' ||
    rawStatus === 'PENDING_APPROVAL' ||
    rawStatus === 'REJECTED' ||
    rawStatus === 'DRAFT'
      ? rawStatus
      : 'OPEN';
  return {
    id,
    vendorId,
    supplierId: String(data.supplierId || data.supplierName || ''),
    supplierName: String(data.supplierName || 'Unknown supplier'),
    supplierAddress: data.supplierAddress ? String(data.supplierAddress) : undefined,
    supplierPhone: data.supplierPhone ? String(data.supplierPhone) : undefined,
    supplierBusinessNumber: data.supplierBusinessNumber ? String(data.supplierBusinessNumber) : undefined,
    supplierTaxNumber: data.supplierTaxNumber ? String(data.supplierTaxNumber) : undefined,
    orderNumber: String(data.orderNumber || data.referenceNo || id),
    status,
    source: data.source === 'BI_RECOMMENDATION' ? 'BI_RECOMMENDATION' : 'PLANNED',
    notes: data.notes ? String(data.notes) : undefined,
    orderDate: data.orderDate ? String(data.orderDate) : undefined,
    expectedDeliveryDate: data.expectedDeliveryDate ? String(data.expectedDeliveryDate) : undefined,
    destinationWarehouseId: data.destinationWarehouseId ? String(data.destinationWarehouseId) : undefined,
    destinationWarehouseName: data.destinationWarehouseName ? String(data.destinationWarehouseName) : undefined,
    buyerReference: data.buyerReference ? String(data.buyerReference) : undefined,
    supplierQuotationNumber: data.supplierQuotationNumber ? String(data.supplierQuotationNumber) : undefined,
    paymentTerms: data.paymentTerms ? String(data.paymentTerms) : undefined,
    deliveryTerms: data.deliveryTerms ? String(data.deliveryTerms) : undefined,
    currency: data.currency ? String(data.currency) : undefined,
    shippingAddress: data.shippingAddress ? String(data.shippingAddress) : undefined,
    billingAddress: data.billingAddress ? String(data.billingAddress) : undefined,
    requestedBy: data.requestedBy as WorkflowActor | undefined,
    approvedBy: data.approvedBy as WorkflowActor | undefined,
    approvedAt: data.approvedAt ? String(data.approvedAt) : undefined,
    rejectedAt: data.rejectedAt ? String(data.rejectedAt) : undefined,
    items,
    createdAt: String(data.createdAt || new Date(0).toISOString()),
    updatedAt: data.updatedAt ? String(data.updatedAt) : undefined,
    completedAt: data.completedAt ? String(data.completedAt) : undefined,
    cancelledAt: data.cancelledAt ? String(data.cancelledAt) : undefined,
  };
}

export async function fetchPurchaseOrders(vendorId: string): Promise<PurchaseOrder[]> {
  const snapshot = await getDocs(collection(db, 'vendors', vendorId, 'purchase_orders'));
  return snapshot.docs.map(order =>
    normalizePurchaseOrder(vendorId, order.id, order.data() as Record<string, unknown>),
  );
}

export async function fetchSystemInventoryTotals(vendorId: string): Promise<Record<string, number>> {
  const [warehouse, branch] = await Promise.all([
    getDocs(collection(db, 'vendors', vendorId, 'warehouse_inventory')),
    getDocs(collection(db, 'vendors', vendorId, 'branch_inventory')),
  ]);
  const totals: Record<string, number> = {};
  for (const snapshot of [...warehouse.docs, ...branch.docs]) {
    const value = snapshot.data();
    const productId = String(value.productId || '');
    if (productId) totals[productId] = (totals[productId] || 0) + Number(value.quantity || 0);
  }
  return totals;
}

export interface CreatePurchaseOrderInput {
  supplierId: string;
  supplierName: string;
  supplierAddress?: string; supplierPhone?: string; supplierBusinessNumber?: string; supplierTaxNumber?: string;
  source: 'PLANNED' | 'BI_RECOMMENDATION';
  notes?: string;
  orderDate?: string; expectedDeliveryDate?: string; destinationWarehouseId?: string; destinationWarehouseName?: string;
  buyerReference?: string; supplierQuotationNumber?: string; paymentTerms?: string; deliveryTerms?: string; currency?: string; shippingAddress?: string; billingAddress?: string;
  items: Omit<PurchaseOrderItem, 'receivedQuantity'>[];
  requester: WorkflowActor;
}

export async function createPurchaseOrder(
  vendorId: string,
  input: CreatePurchaseOrderInput,
): Promise<PurchaseOrder> {
  if (!input.supplierId || !input.supplierName.trim()) throw new Error('Select a supplier.');
  if (!input.items.length) throw new Error('Add at least one purchase-order line.');
  input.items.forEach(item => {
    if (item.orderedQuantity <= 0) throw new Error(`Order quantity must be positive for ${item.productName}.`);
    if (item.unitCost < 0) throw new Error(`Unit cost cannot be negative for ${item.productName}.`);
  });
  const now = new Date().toISOString();
  const id = `po_${crypto.randomUUID()}`;
  const orderNumber = `PO-${new Date().toISOString().slice(0, 10).replaceAll('-', '')}-${id.slice(-6).toUpperCase()}`;
  const order: PurchaseOrder = {
    id, vendorId, supplierId: input.supplierId, supplierName: input.supplierName.trim(), supplierAddress: input.supplierAddress || '', supplierPhone: input.supplierPhone || '', supplierBusinessNumber: input.supplierBusinessNumber || '', supplierTaxNumber: input.supplierTaxNumber || '',
    orderNumber, status: 'PENDING_APPROVAL', source: input.source, notes: input.notes?.trim() || '', orderDate: input.orderDate || now.slice(0, 10), expectedDeliveryDate: input.expectedDeliveryDate || '', destinationWarehouseId: input.destinationWarehouseId || '', destinationWarehouseName: input.destinationWarehouseName || '', buyerReference: input.buyerReference || '', supplierQuotationNumber: input.supplierQuotationNumber || '', paymentTerms: input.paymentTerms || '', deliveryTerms: input.deliveryTerms || '', currency: input.currency || '', shippingAddress: input.shippingAddress || '', billingAddress: input.billingAddress || '',
    items: input.items.map(item => ({ ...item, receivedQuantity: 0 })),
    requestedBy: input.requester, createdAt: now, updatedAt: now,
  };
  await setDoc(doc(db, 'vendors', vendorId, 'purchase_orders', id), order);
  try {
    await createApprovalRequest(vendorId, {
      entityType: 'PURCHASE_ORDER', entityId: id,
      idempotencyKey: `purchase-order:${id}`,
      title: `${input.source === 'BI_RECOMMENDATION' ? 'BI recommended' : 'Planned'} purchase order ${orderNumber}`,
      description: `${order.items.length} line(s) for ${order.supplierName}; approval creates no inventory movement.`,
      requester: input.requester,
      dataPayload: {
        purchaseOrderId: id, purchaseOrderNumber: orderNumber,
        supplierId: order.supplierId, supplierName: order.supplierName,
        notes: order.notes, source: order.source,
        items: order.items.map(item => ({ ...item, quantity: item.orderedQuantity })),
      },
    });
  } catch (error) {
    // Roll back the just-created PO when its paired approval request cannot be
    // persisted. The form remains open with the user's lines for a safe retry.
    await deleteDoc(doc(db, 'vendors', vendorId, 'purchase_orders', id)).catch(() => {});
    throw error;
  }
  await logBIEvent(vendorId, 'PURCHASE_ORDER_CREATED', `${order.source} ${order.orderNumber} submitted for approval`, { purchaseOrderId: id, supplierId: order.supplierId, lineCount: order.items.length, total: order.items.reduce((sum, item) => sum + item.orderedQuantity * item.unitCost, 0), inventoryChanged: false }, { staffId: input.requester.id, staffName: input.requester.name, staffRole: input.requester.role });
  return order;
}

export async function fetchSupplierPurchaseOrders(
  vendorId: string,
  supplierId: string,
): Promise<PurchaseOrder[]> {
  const orders = await fetchPurchaseOrders(vendorId);
  return orders.filter(order =>
    order.supplierId === supplierId &&
    (order.status === 'OPEN' || order.status === 'PARTIALLY_RECEIVED'),
  );
}

export async function fetchSuppliers(vendorId: string): Promise<Supplier[]> {
  const supplierSnapshot = await getDocs(collection(db, 'vendors', vendorId, 'suppliers'));
  const suppliers = supplierSnapshot.docs.map(item => {
    const data = item.data();
    return {
      id: item.id,
      vendorId,
      name: String(data.name || data.supplierName || item.id),
      code: data.code ? String(data.code) : undefined,
      fullAddress: data.fullAddress ? String(data.fullAddress) : undefined,
      phone: data.phone ? String(data.phone) : undefined,
      businessNumber: data.businessNumber ? String(data.businessNumber) : undefined,
      taxNumber: data.taxNumber ? String(data.taxNumber) : undefined,
      status: data.status === 'suspended' || data.status === 'archived' ? data.status : 'active',
      createdAt: data.createdAt ? String(data.createdAt) : undefined,
    } satisfies Supplier;
  }).filter(supplier => supplier.status === 'active');
  if (suppliers.length > 0) return suppliers;

  const orders = await fetchPurchaseOrders(vendorId);
  const unique = new Map<string, Supplier>();
  orders.forEach(order => {
    unique.set(order.supplierId, {
      id: order.supplierId,
      vendorId,
      name: order.supplierName,
      status: 'active',
    });
  });
  return [...unique.values()];
}

export type NewSupplierInput = Pick<Supplier, 'name' | 'code' | 'fullAddress' | 'phone' | 'businessNumber' | 'taxNumber'>;

export async function saveSupplier(vendorId: string, input: NewSupplierInput, actor: WorkflowActor): Promise<Supplier> {
  const name = input.name.trim(); const fullAddress = input.fullAddress?.trim() || ''; const phone = input.phone?.trim() || ''; const businessNumber = input.businessNumber?.trim() || ''; const taxNumber = input.taxNumber?.trim() || '';
  if (!name || !fullAddress || !phone || !businessNumber || !taxNumber) throw new Error('Supplier name, full address, phone, Business Number and Tax Number are required.');
  const existing = await fetchSuppliers(vendorId);
  if (existing.some(item => item.name.trim().toLowerCase() === name.toLowerCase())) throw new Error('A supplier with this name already exists.');
  if (existing.some(item => item.businessNumber?.trim().toLowerCase() === businessNumber.toLowerCase())) throw new Error('A supplier with this Business Number already exists.');
  if (existing.some(item => item.taxNumber?.trim().toLowerCase() === taxNumber.toLowerCase())) throw new Error('A supplier with this Tax Number already exists.');
  const id = `supplier_${crypto.randomUUID()}`; const createdAt = new Date().toISOString();
  const supplier: Supplier = { id, vendorId, name, code: input.code?.trim() || `SUP-${id.slice(-6).toUpperCase()}`, fullAddress, phone, businessNumber, taxNumber, status: 'active', createdAt };
  await setDoc(doc(db, 'vendors', vendorId, 'suppliers', id), supplier);
  await logBIEvent(vendorId, 'SUPPLIER_CREATED', `Supplier ${name} created`, { supplierId: id, code: supplier.code, businessNumber, taxNumberPresent: true }, { staffId: actor.id, staffName: actor.name, staffRole: actor.role });
  return supplier;
}

export async function fetchProductLedger(
  vendorId: string,
  warehouseId: string,
  productId: string,
  fromDate?: string,
  toDate?: string,
): Promise<ProductLedgerEntry[]> {
  const snapshot = await getDocs(collection(db, 'vendors', vendorId, 'inventory_movements'));
  const fromTime = fromDate ? new Date(`${fromDate}T00:00:00`).getTime() : Number.NEGATIVE_INFINITY;
  const toTime = toDate ? new Date(`${toDate}T23:59:59.999`).getTime() : Number.POSITIVE_INFINITY;
  return snapshot.docs.flatMap(item => {
    const data = item.data();
    const locationType = String(data.locationType || (data.warehouseId ? 'warehouse' : ''));
    const locationId = String(data.locationId || data.warehouseId || '');
    const createdAt = String(data.createdAt || '');
    const createdTime = new Date(createdAt).getTime();
    if (
      String(data.productId || '') !== productId ||
      locationType !== 'warehouse' ||
      locationId !== warehouseId ||
      Number.isNaN(createdTime) ||
      createdTime < fromTime ||
      createdTime > toTime
    ) {
      return [];
    }
    return [{
      id: item.id,
      productId,
      movementType: String(data.movementType || data.entityType || 'adjustment'),
      quantityDelta: Number(data.quantityDelta || 0),
      quantityBefore: Number(data.quantityBefore ?? data.beforeQuantity ?? 0),
      quantityAfter: Number(data.quantityAfter ?? data.afterQuantity ?? 0),
      sourceDocumentReference: String(data.sourceDocumentReference || data.entityId || data.orderId || data.requestId || item.id),
      createdAt,
    }];
  }).sort((left, right) => left.createdAt.localeCompare(right.createdAt));
}

// Fetch Supplier Receipts
export async function fetchSupplierReceipts(vendorId: string): Promise<SupplierReceipt[]> {
  try {
    const colRef = collection(db, 'vendors', vendorId, 'supplier_receipts');
    const snap = await getDocs(colRef);
    if (!snap.empty) {
      return snap.docs.map(d => d.data() as SupplierReceipt);
    }
  } catch (e) {
    console.warn(e);
  }
  const raw = localStorage.getItem(`${LOCAL_STORAGE_KEY}_receipts_${vendorId}`);
  return raw ? JSON.parse(raw) : [];
}

// 2. Transfer Stock from Central Warehouse to Branch
export async function transferStockFromWarehouse(
  vendorId: string,
  warehouseId: string,
  warehouseName: string,
  targetBranchId: string,
  targetBranchName: string,
  items: {
    productId: string;
    productName: string;
    quantity: number;
    sku?: string;
    unitOfMeasure?: string;
    batchNumber?: string;
    serialNumber?: string;
  }[],
  notes: string | undefined,
  requester: WorkflowActor,
): Promise<ApprovalRequest> {
  const [warehouse, branch, availableStock] = await Promise.all([
    fetchWarehouses(vendorId).then(list => list.find(item => item.id === warehouseId)),
    fetchBranches(vendorId).then(list => list.find(item => item.id === targetBranchId)),
    fetchWarehouseStock(vendorId, warehouseId),
  ]);
  if (!warehouse || !branch) throw new Error('Transfer source or destination was not found.');
  assertWarehouseToBranchRoute(vendorId, 'warehouse', warehouse, 'branch', branch);
  const draftLines: TransferDraftLine[] = items.map(item => ({
    ...item,
    sku: item.sku || '',
    quantityRequested: item.quantity,
    quantityApproved: 0,
    quantityDispatched: 0,
    quantityReceived: 0,
    unitOfMeasure: item.unitOfMeasure || 'unit',
  }));
  const validatedLines = draftLines.reduce<TransferDraftLine[]>(
    (current, item) => addTransferLine(current, item),
    [],
  );
  assertRequestedStockAvailable(validatedLines, availableStock);
  const transferId = `trf_${Math.random().toString(36).substring(2, 9)}`;
  return createApprovalRequest(vendorId, {
    entityType: 'WAREHOUSE_TO_BRANCH_TRANSFER',
    entityId: transferId,
    title: `Warehouse transfer to ${targetBranchName}`,
    description: `${items.length} inventory line${items.length === 1 ? '' : 's'} awaiting transfer approval.`,
    requester,
    warehouseId,
    warehouseName,
    branchId: targetBranchId,
    branchName: targetBranchName,
    dataPayload: {
      sourceType: 'warehouse',
      sourceId: warehouseId,
      sourceName: warehouseName,
      targetBranchId,
      targetBranchName,
      notes,
      items,
    },
  });
}

export async function transferStockBetweenBranches(
  vendorId: string,
  sourceBranchId: string,
  sourceBranchName: string,
  targetBranchId: string,
  targetBranchName: string,
  items: { productId: string; productName: string; quantity: number }[],
  notes: string | undefined,
  requester: WorkflowActor,
): Promise<ApprovalRequest> {
  await Promise.all([
    requireActiveOperationalResource(vendorId, 'branch', sourceBranchId),
    requireActiveOperationalResource(vendorId, 'branch', targetBranchId),
  ]);
  const transferId = `trf_${Math.random().toString(36).substring(2, 9)}`;
  return createApprovalRequest(vendorId, {
    entityType: 'BRANCH_TO_BRANCH_TRANSFER',
    entityId: transferId,
    title: `Branch transfer: ${sourceBranchName} to ${targetBranchName}`,
    description: `${items.length} inventory line${items.length === 1 ? '' : 's'} awaiting branch transfer approval.`,
    requester,
    branchId: targetBranchId,
    branchName: targetBranchName,
    dataPayload: {
      sourceType: 'branch',
      sourceId: sourceBranchId,
      sourceName: sourceBranchName,
      targetBranchId,
      targetBranchName,
      notes,
      items,
    },
  });
}

// Fetch Stock Transfers
export async function fetchStockTransfers(vendorId: string): Promise<StockTransfer[]> {
  try {
    const colRef = collection(db, 'vendors', vendorId, 'transfers');
    const snap = await getDocs(colRef);
    if (!snap.empty) {
      return snap.docs.map(d => d.data() as StockTransfer);
    }
  } catch (e) {
    console.warn(e);
  }
  const raw = localStorage.getItem(`${LOCAL_STORAGE_KEY}_transfers_${vendorId}`);
  return raw ? JSON.parse(raw) : [];
}

export async function dispatchStockTransfer(
  vendorId: string,
  transferId: string,
  dispatcher: WorkflowActor,
  expectedVersion: number,
): Promise<StockTransfer> {
  if (!canAccessTransferLedger(dispatcher.role)) {
    throw new Error('This role is not authorised to dispatch warehouse transfers.');
  }
  const transferRef = doc(db, 'vendors', vendorId, 'transfers', transferId);
  const now = new Date().toISOString();
  const updated = await runTransaction(db, async transaction => {
    const transferSnapshot = await transaction.get(transferRef);
    if (!transferSnapshot.exists()) throw new Error('Transfer not found.');
    const transfer = transferSnapshot.data() as StockTransfer;
    if (transfer.vendorId !== vendorId) throw new Error('Transfer tenant mismatch.');
    if ((transfer.version || 1) !== expectedVersion) {
      throw new Error('This transfer changed after it was opened. Refresh and try again.');
    }
    assertCanDispatch(transfer.status);
    const warehouseRef = doc(db, 'vendors', vendorId, 'warehouses', transfer.sourceWarehouseId);
    const branchRef = doc(db, 'vendors', vendorId, 'branches', transfer.targetBranchId);
    const totals = new Map<string, { productName: string; quantity: number }>();
    transfer.items.forEach(item => {
      const quantity = item.quantityApproved ?? item.quantityRequested ?? item.quantity;
      const current = totals.get(item.productId);
      totals.set(item.productId, {
        productName: item.productName,
        quantity: (current?.quantity || 0) + quantity,
      });
    });
    const productEntries = [...totals.entries()];
    const inventoryRefs = productEntries.map(([productId]) =>
      doc(db, 'vendors', vendorId, 'warehouse_inventory', `${vendorId}_${transfer.sourceWarehouseId}_${productId}`),
    );
    const [warehouseSnapshot, branchSnapshot, inventorySnapshots] = await Promise.all([
      transaction.get(warehouseRef),
      transaction.get(branchRef),
      Promise.all(inventoryRefs.map(reference => transaction.get(reference))),
    ]);
    if (!warehouseSnapshot.exists() || !branchSnapshot.exists()) {
      throw new Error('Transfer source or destination no longer exists.');
    }
    assertWarehouseToBranchRoute(
      vendorId,
      'warehouse',
      warehouseSnapshot.data() as Warehouse,
      'branch',
      branchSnapshot.data() as Branch,
    );
    productEntries.forEach(([productId, product], index) => {
      const before = inventorySnapshots[index].exists()
        ? Number(inventorySnapshots[index].data().quantity)
        : 0;
      if (product.quantity <= 0 || before < product.quantity) {
        throw new Error(`Insufficient warehouse stock to dispatch ${product.productName}.`);
      }
      const after = before - product.quantity;
      transaction.set(inventoryRefs[index], {
        id: inventoryRefs[index].id,
        vendorId,
        warehouseId: transfer.sourceWarehouseId,
        productId,
        quantity: after,
        lastUpdated: now,
      });
      const movementId = `dispatch_${transferId}_${productId}`;
      transaction.set(doc(db, 'vendors', vendorId, 'inventory_movements', movementId), {
        id: movementId,
        tenantId: vendorId,
        vendorId,
        transferId,
        entityType: 'WAREHOUSE_TO_BRANCH_TRANSFER',
        entityId: transferId,
        movementType: 'transfer_out',
        locationType: 'warehouse',
        locationId: transfer.sourceWarehouseId,
        productId,
        productName: product.productName,
        quantityDelta: -product.quantity,
        quantityBefore: before,
        quantityAfter: after,
        sourceDocumentReference: transfer.transferNo,
        createdAt: now,
      });
    });
    const dispatched: StockTransfer = {
      ...transfer,
      items: transfer.items.map(item => ({
        ...item,
        quantityDispatched: item.quantityApproved ?? item.quantityRequested ?? item.quantity,
      })),
      status: 'IN_TRANSIT',
      dispatcher,
      dispatchedAt: now,
      version: expectedVersion + 1,
    };
    transaction.set(transferRef, dispatched);
    transaction.set(doc(db, 'vendors', vendorId, 'approval_events', `dispatch_${transferId}`), {
      id: `dispatch_${transferId}`,
      tenantId: vendorId,
      vendorId,
      entityType: 'WAREHOUSE_TO_BRANCH_TRANSFER',
      entityId: transferId,
      requester: transfer.requester,
      approver: dispatcher,
      requestedAt: transfer.requestedAt,
      decisionAt: now,
      outcome: 'IN_TRANSIT',
      reason: 'Approved transfer dispatched from warehouse.',
      warehouseId: transfer.sourceWarehouseId,
      branchId: transfer.targetBranchId,
      createdAt: now,
    });
    return dispatched;
  });
  await logBIEvent(
    vendorId,
    'INVENTORY_WORKFLOW_TRANSITION',
    `Transfer ${updated.transferNo} dispatched and marked in transit`,
    { transferId, status: updated.status, version: updated.version },
    { staffId: dispatcher.id, staffName: dispatcher.name, staffRole: dispatcher.role },
  );
  return updated;
}

export async function confirmStockTransferReceipt(
  vendorId: string,
  transferId: string,
  receivingOfficer: WorkflowActor,
  expectedVersion: number,
  receipts: { lineIndex: number; quantityReceived: number }[],
  reason: string,
): Promise<StockTransfer> {
  if (!canAccessTransferLedger(receivingOfficer.role)) {
    throw new Error('This role is not authorised to confirm branch transfer receipts.');
  }
  const transferRef = doc(db, 'vendors', vendorId, 'transfers', transferId);
  const now = new Date().toISOString();
  const updated = await runTransaction(db, async transaction => {
    const transferSnapshot = await transaction.get(transferRef);
    if (!transferSnapshot.exists()) throw new Error('Transfer not found.');
    const transfer = transferSnapshot.data() as StockTransfer;
    if (transfer.vendorId !== vendorId) throw new Error('Transfer tenant mismatch.');
    if ((transfer.version || 1) !== expectedVersion) {
      throw new Error('This transfer changed after it was opened. Refresh and try again.');
    }
    const status = String(transfer.status).toUpperCase();
    if (status !== 'IN_TRANSIT' && status !== 'PARTIALLY_RECEIVED') {
      throw new Error('Only stock in transit can be received.');
    }
    const receiptByLine = new Map(receipts.map(receipt => [receipt.lineIndex, receipt.quantityReceived]));
    const totalOutstanding = transfer.items.reduce((sum, item) =>
      sum + Math.max(0, (item.quantityDispatched || 0) - (item.quantityReceived || 0)), 0);
    const totalReceiving = receipts.reduce((sum, receipt) => sum + receipt.quantityReceived, 0);
    validateTransferReceipt(receivingOfficer.role, totalReceiving, totalOutstanding, reason);

    const receiptTotals = new Map<string, { productName: string; quantity: number }>();
    const nextItems = transfer.items.map((item, index) => {
      const receiving = receiptByLine.get(index) || 0;
      const outstanding = (item.quantityDispatched || 0) - (item.quantityReceived || 0);
      if (receiving < 0 || receiving > outstanding) {
        throw new Error(`Received quantity exceeds stock in transit for ${item.productName}.`);
      }
      if (receiving > 0) {
        const current = receiptTotals.get(item.productId);
        receiptTotals.set(item.productId, {
          productName: item.productName,
          quantity: (current?.quantity || 0) + receiving,
        });
      }
      return { ...item, quantityReceived: (item.quantityReceived || 0) + receiving };
    });
    const branchRef = doc(db, 'vendors', vendorId, 'branches', transfer.targetBranchId);
    const productEntries = [...receiptTotals.entries()];
    const inventoryRefs = productEntries.map(([productId]) =>
      doc(db, 'vendors', vendorId, 'branch_inventory', `${vendorId}_${transfer.targetBranchId}_${productId}`),
    );
    const [branchSnapshot, inventorySnapshots] = await Promise.all([
      transaction.get(branchRef),
      Promise.all(inventoryRefs.map(reference => transaction.get(reference))),
    ]);
    if (!branchSnapshot.exists()) throw new Error('Destination branch no longer exists.');
    const branch = branchSnapshot.data() as Branch;
    if (branch.vendorId !== vendorId || !canResourceProcessTransactions(branch)) {
      throw new Error('Destination branch is not active for receiving.');
    }
    productEntries.forEach(([productId, product], index) => {
      const before = inventorySnapshots[index].exists()
        ? Number(inventorySnapshots[index].data().quantity)
        : 0;
      const after = before + product.quantity;
      transaction.set(inventoryRefs[index], {
        id: inventoryRefs[index].id,
        vendorId,
        branchId: transfer.targetBranchId,
        productId,
        quantity: after,
        lastUpdated: now,
      });
      const movementId = `receive_${transferId}_v${expectedVersion}_${productId}`;
      transaction.set(doc(db, 'vendors', vendorId, 'inventory_movements', movementId), {
        id: movementId,
        tenantId: vendorId,
        vendorId,
        transferId,
        entityType: 'WAREHOUSE_TO_BRANCH_TRANSFER',
        entityId: transferId,
        movementType: 'transfer_in',
        locationType: 'branch',
        locationId: transfer.targetBranchId,
        productId,
        productName: product.productName,
        quantityDelta: product.quantity,
        quantityBefore: before,
        quantityAfter: after,
        sourceDocumentReference: transfer.transferNo,
        reason,
        createdAt: now,
      });
    });
    const completed = nextItems.every(item =>
      (item.quantityReceived || 0) >= (item.quantityDispatched || 0));
    const received: StockTransfer = {
      ...transfer,
      items: nextItems,
      status: completed ? 'COMPLETED' : 'PARTIALLY_RECEIVED',
      receivingOfficer,
      version: expectedVersion + 1,
    };
    transaction.set(transferRef, received);
    const auditId = `receive_${transferId}_v${expectedVersion}`;
    transaction.set(doc(db, 'vendors', vendorId, 'approval_events', auditId), {
      id: auditId,
      tenantId: vendorId,
      vendorId,
      entityType: 'WAREHOUSE_TO_BRANCH_TRANSFER',
      entityId: transferId,
      requester: transfer.requester,
      approver: receivingOfficer,
      requestedAt: transfer.requestedAt,
      decisionAt: now,
      outcome: received.status,
      reason: reason || 'Full transfer receipt confirmed.',
      warehouseId: transfer.sourceWarehouseId,
      branchId: transfer.targetBranchId,
      beforeAndAfterQuantities: nextItems.map((item, index) => ({
        productId: item.productId,
        before: transfer.items[index].quantityReceived || 0,
        after: item.quantityReceived || 0,
      })),
      createdAt: now,
    });
    return received;
  });
  await logBIEvent(
    vendorId,
    'INVENTORY_WORKFLOW_TRANSITION',
    `Transfer ${updated.transferNo} receipt confirmed as ${updated.status}`,
    { transferId, status: updated.status, version: updated.version, reason },
    { staffId: receivingOfficer.id, staffName: receivingOfficer.name, staffRole: receivingOfficer.role },
  );
  return updated;
}

// 3. Branch Stock Adjustment Form (for Opening Balance, Recount, Damage, etc.)
export async function adjustBranchStock(
  vendorId: string,
  branchId: string,
  branchName: string,
  type: 'opening_balance' | 'recount' | 'damage' | 'return' | 'other',
  items: { productId: string; productName: string; quantityDelta: number; reason?: string }[],
  notes: string | undefined,
  requester: WorkflowActor,
): Promise<ApprovalRequest | StockAdjustment> {
  await requireActiveOperationalResource(vendorId, 'branch', branchId);
  const productIndex = new Map((await fetchProducts(vendorId)).map(product => [product.id, product]));
  items.forEach(item => {
    const product = productIndex.get(item.productId);
    if (!product || product.status === 'archived' || (product.productType || 'INVENTORY') !== 'INVENTORY') {
      throw new Error(`${item.productName} is not an active inventory product and cannot be adjusted.`);
    }
  });
  if (type === 'opening_balance' || type === 'recount') {
    const adjustmentId = `adj_${Math.random().toString(36).substring(2, 9)}`;
    return createApprovalRequest(vendorId, {
      entityType: type === 'opening_balance' ? 'OPENING_BALANCE_ADJUSTMENT' : 'STOCKTAKE_ADJUSTMENT',
      entityId: adjustmentId,
      title: `${type === 'opening_balance' ? 'Opening balance' : 'Stocktake'} adjustment for ${branchName}`,
      description: `${items.length} inventory adjustment line${items.length === 1 ? '' : 's'} awaiting approval.`,
      requester,
      branchId,
      branchName,
      dataPayload: {
        locationType: 'branch',
        locationId: branchId,
        locationName: branchName,
        notes,
        items,
      },
    });
  }
  const now = new Date().toISOString();
  const adjId = `adj_${Math.random().toString(36).substring(2, 9)}`;

  const brStock = await fetchBranchStock(vendorId, branchId);
  items.forEach(item => {
    const prev = brStock[item.productId] || 0;
    brStock[item.productId] = Math.max(0, prev + item.quantityDelta);
  });

  const adjustment: StockAdjustment = {
    id: adjId,
    vendorId,
    branchId,
    branchName,
    type,
    date: now,
    items,
    notes,
    createdAt: now,
  };

  try {
    await setDoc(doc(db, 'vendors', vendorId, 'adjustments', adjId), adjustment);
    for (const item of items) {
      const brInvId = `${vendorId}_${branchId}_${item.productId}`;
      await setDoc(doc(db, 'vendors', vendorId, 'branch_inventory', brInvId), {
        id: brInvId,
        vendorId,
        branchId,
        productId: item.productId,
        quantity: brStock[item.productId],
        lastUpdated: now
      });
    }
  } catch (e) {
    console.warn('Firestore adjustment error', e);
  }

  localStorage.setItem(`${LOCAL_STORAGE_KEY}_br_stock_${vendorId}_${branchId}`, JSON.stringify(brStock));
  const existingAdjRaw = localStorage.getItem(`${LOCAL_STORAGE_KEY}_adjustments_${vendorId}`);
  const existingAdj = existingAdjRaw ? JSON.parse(existingAdjRaw) : [];
  localStorage.setItem(`${LOCAL_STORAGE_KEY}_adjustments_${vendorId}`, JSON.stringify([adjustment, ...existingAdj]));

  return adjustment;
}

export async function requestIncompletePurchaseOrderCancellation(
  vendorId: string,
  purchaseOrderId: string,
  requester: WorkflowActor,
  reason: string,
): Promise<ApprovalRequest> {
  const purchaseOrderSnapshot = await getDoc(
    doc(db, 'vendors', vendorId, 'purchase_orders', purchaseOrderId),
  );
  if (!purchaseOrderSnapshot.exists()) throw new Error('Purchase order not found.');
  const purchaseOrderStatus = String(purchaseOrderSnapshot.data().status || '').toUpperCase();
  if (purchaseOrderStatus === 'COMPLETED' || purchaseOrderStatus === 'CANCELLED') {
    throw new Error('Only an incomplete purchase order can be submitted for cancellation.');
  }
  return createApprovalRequest(vendorId, {
    entityType: 'PURCHASE_ORDER_CANCELLATION',
    entityId: purchaseOrderId,
    title: `Cancel incomplete purchase order ${purchaseOrderId}`,
    description: reason,
    requester,
    dataPayload: { purchaseOrderId, notes: reason },
  });
}

// Fetch Stock Adjustments
export async function fetchStockAdjustments(vendorId: string): Promise<StockAdjustment[]> {
  try {
    const colRef = collection(db, 'vendors', vendorId, 'adjustments');
    const snap = await getDocs(colRef);
    if (!snap.empty) {
      return snap.docs.map(d => d.data() as StockAdjustment);
    }
  } catch (e) {
    console.warn(e);
  }
  const raw = localStorage.getItem(`${LOCAL_STORAGE_KEY}_adjustments_${vendorId}`);
  return raw ? JSON.parse(raw) : [];
}

// 4. Submit POS Order (Checkout)
export async function processPOSOrder(
  tenantId: string,
  vendorId: string,
  actorId: string,
  orderId: string,
  orderData: Omit<Order, 'id' | 'createdAt' | 'status'>,
): Promise<SaleCompletionResult> {
  const now = new Date().toISOString();
  const result = await completeSaleTransaction(
    {
      tenantId,
      vendorId,
      actorId,
      checkoutAttemptId: orderId,
      orderId,
      createdAt: now,
      orderData,
    },
    createFirestoreAtomicSaleRunner(vendorId),
  );

  if (!result.success) {
    return result;
  }

  try {
    if (!result.duplicate) {
      const stockKey = `${LOCAL_STORAGE_KEY}_br_stock_${vendorId}_${orderData.branchId}`;
      const stockRaw = localStorage.getItem(stockKey);
      if (stockRaw) {
        const stock = JSON.parse(stockRaw) as Record<string, number>;
        result.movements.forEach(movement => {
          stock[movement.productId] = movement.sourceAfterQty ?? movement.compatibility.quantityAfter;
        });
        localStorage.setItem(stockKey, JSON.stringify(stock));
      }
    }

    const ordersKey = `${LOCAL_STORAGE_KEY}_orders_${vendorId}`;
    const existingOrdersRaw = localStorage.getItem(ordersKey);
    const existingOrders: Order[] = existingOrdersRaw ? JSON.parse(existingOrdersRaw) : [];
    if (!existingOrders.some(order => order.id === result.order.id)) {
      localStorage.setItem(ordersKey, JSON.stringify([result.order, ...existingOrders]));
    }
  } catch (error) {
    console.warn('Committed sale local cache update failed:', error);
  }

  return result;
}

// Fetch Orders
export async function fetchOrders(vendorId: string, branchId?: string): Promise<Order[]> {
  try {
    const colRef = collection(db, 'vendors', vendorId, 'orders');
    const snap = await getDocs(colRef);
    if (!snap.empty) {
      let orders = snap.docs.map(d => d.data() as Order);
      if (branchId) {
        orders = orders.filter(o => o.branchId === branchId);
      }
      return orders;
    }
  } catch (e) {
    console.warn(e);
  }
  const raw = localStorage.getItem(`${LOCAL_STORAGE_KEY}_orders_${vendorId}`);
  const list: Order[] = raw ? JSON.parse(raw) : [];
  return branchId ? list.filter(o => o.branchId === branchId) : list;
}

// Default Menu Presets by Role
export const DEFAULT_ROLE_MENUS: Record<StaffRole, AppMenuId[]> = {
  sysadmin: ['desk', 'pos', 'delivery', 'warehouse', 'transfers', 'branches', 'products', 'stock_matrix', 'managed_stocktake', 'purchase_orders', 'financial', 'customers', 'reports', 'approvals', 'staff', 'bi_audit', 'settings', 'billing'],
  manager: ['desk', 'pos', 'delivery', 'warehouse', 'transfers', 'branches', 'products', 'stock_matrix', 'managed_stocktake', 'purchase_orders', 'financial', 'customers', 'reports', 'approvals', 'settings', 'billing'],
  cashier: ['desk', 'pos', 'customers', 'reports'],
  warehouse_staff: ['desk', 'warehouse', 'transfers', 'products', 'stock_matrix', 'managed_stocktake', 'purchase_orders', 'approvals'],
};

// Default Starter Staff Members
export function getDefaultStaffList(vendorId: string, vendorEmail: string): StaffMember[] {
  const now = new Date().toISOString();
  return [
    {
      id: `staff_${vendorId}_sysadmin`,
      vendorId,
      name: 'System Administrator (You)',
      email: vendorEmail,
      role: 'sysadmin',
      grantedMenuIds: DEFAULT_ROLE_MENUS.sysadmin,
      status: 'active',
      pinCode: '1234',
      createdAt: now,
      lastActiveAt: now,
    },
    {
      id: `staff_${vendorId}_manager`,
      vendorId,
      name: 'Alex Rivera',
      email: 'alex.rivera@itred-retail.com',
      phone: '+1 (555) 234-5678',
      role: 'manager',
      grantedMenuIds: DEFAULT_ROLE_MENUS.manager,
      status: 'active',
      pinCode: '1234',
      createdAt: now,
    },
    {
      id: `staff_${vendorId}_cashier`,
      vendorId,
      name: 'Sarah Chen',
      email: 'sarah.c@itred-retail.com',
      phone: '+1 (555) 345-6789',
      role: 'cashier',
      grantedMenuIds: DEFAULT_ROLE_MENUS.cashier,
      status: 'active',
      pinCode: '1234',
      createdAt: now,
    },
    {
      id: `staff_${vendorId}_warehouse`,
      vendorId,
      name: 'Marcus Vance',
      email: 'm.vance@itred-retail.com',
      phone: '+1 (555) 456-7890',
      role: 'warehouse_staff',
      grantedMenuIds: DEFAULT_ROLE_MENUS.warehouse_staff,
      status: 'active',
      pinCode: '1234',
      createdAt: now,
    }
  ];
}

// Fetch Staff Members
export async function fetchStaffMembers(vendorId: string, userEmail: string = ''): Promise<StaffMember[]> {
  try {
    const colRef = collection(db, 'vendors', vendorId, 'staff');
    const snap = await getDocs(colRef);
    if (!snap.empty) {
      const list = snap.docs.map(d => d.data() as StaffMember);
      if (!list.some(s => s.role === 'sysadmin')) {
        const sysAdmin: StaffMember = {
          id: `staff_${vendorId}_sysadmin`,
          vendorId,
          name: 'System Administrator (You)',
          email: userEmail || 'sysadmin@itred.com',
          role: 'sysadmin',
          grantedMenuIds: DEFAULT_ROLE_MENUS.sysadmin,
          status: 'active',
          createdAt: new Date().toISOString()
        };
        list.unshift(sysAdmin);
      }
      return list;
    }
  } catch (e) {
    console.warn('Firestore fetch staff error:', e);
  }

  const raw = localStorage.getItem(`${LOCAL_STORAGE_KEY}_staff_${vendorId}`);
  if (raw) {
    const list: StaffMember[] = JSON.parse(raw);
    if (list && list.length > 0) return list;
  }

  const defaultStaff = getDefaultStaffList(vendorId, userEmail || 'sysadmin@vendor.com');
  localStorage.setItem(`${LOCAL_STORAGE_KEY}_staff_${vendorId}`, JSON.stringify(defaultStaff));
  
  // Persist to Firestore asynchronously
  try {
    for (const s of defaultStaff) {
      await setDoc(doc(db, 'vendors', vendorId, 'staff', s.id), s);
    }
  } catch (e) {
    console.warn(e);
  }

  return defaultStaff;
}

// Save or Update Staff Member
export async function saveStaffMember(vendorId: string, staffData: Partial<StaffMember>): Promise<StaffMember> {
  const now = new Date().toISOString();
  const id = staffData.id || `staff_${vendorId}_${Math.random().toString(36).substring(2, 8)}`;
  
  const role = staffData.role || 'cashier';
  const defaultMenus = DEFAULT_ROLE_MENUS[role];

  const fullStaff: StaffMember = {
    id,
    vendorId,
    name: staffData.name || 'Staff Member',
    email: staffData.email || 'staff@itred.com',
    phone: staffData.phone || '',
    role,
    assignedBranchId: staffData.assignedBranchId,
    assignedBranchName: staffData.assignedBranchName,
    grantedMenuIds: staffData.grantedMenuIds && staffData.grantedMenuIds.length > 0 
      ? staffData.grantedMenuIds 
      : defaultMenus,
    status: staffData.status || 'active',
    pinCode: staffData.pinCode || '1234',
    createdAt: staffData.createdAt || now,
    lastActiveAt: now,
  };

  try {
    await setDoc(doc(db, 'vendors', vendorId, 'staff', id), fullStaff);
  } catch (e) {
    console.warn(e);
  }

  const current = await fetchStaffMembers(vendorId, staffData.email);
  const idx = current.findIndex(s => s.id === id);
  let updated: StaffMember[];
  if (idx >= 0) {
    updated = [...current];
    updated[idx] = fullStaff;
  } else {
    updated = [fullStaff, ...current];
  }

  localStorage.setItem(`${LOCAL_STORAGE_KEY}_staff_${vendorId}`, JSON.stringify(updated));

  // Log in BI
  await logBIEvent(
    vendorId,
    staffData.id ? 'STAFF_MUTATED' : 'STAFF_CREATED',
    `Staff profile ${fullStaff.name} (${fullStaff.role}) saved with ${fullStaff.grantedMenuIds.length} menus granted.`,
    { staffId: fullStaff.id, role: fullStaff.role, menus: fullStaff.grantedMenuIds }
  );

  return fullStaff;
}

function approvalTypeForEntity(entityType: CriticalInventoryEntityType): ApprovalRequestType {
  if (entityType === 'SUPPLIER_STOCK_RECEIPT') return 'supplier_intake';
  if (entityType === 'WAREHOUSE_TO_BRANCH_TRANSFER' || entityType === 'BRANCH_TO_BRANCH_TRANSFER') return 'stock_transfer';
  if (entityType === 'PURCHASE_ORDER_CANCELLATION') return 'purchase_order_cancellation';
  if (entityType === 'PURCHASE_ORDER') return 'purchase_order';
  if (entityType === 'PRODUCT_COST_CHANGE') return 'product_cost_change';
  return 'stock_adjustment';
}

export interface InventoryApprovalSubmission {
  entityType: CriticalInventoryEntityType;
  entityId: string;
  idempotencyKey?: string;
  title: string;
  description: string;
  requester: WorkflowActor;
  branchId?: string;
  branchName?: string;
  warehouseId?: string;
  warehouseName?: string;
  dataPayload: ApprovalDataPayload;
}

export async function fetchInventoryApprovalPolicy(vendorId: string): Promise<InventoryApprovalPolicy> {
  const policyRef = doc(db, 'vendors', vendorId, 'settings', 'inventory_approval_policy');
  try {
    const snapshot = await getDoc(policyRef);
    if (snapshot.exists()) {
      return { ...DEFAULT_INVENTORY_APPROVAL_POLICY, ...snapshot.data() } as InventoryApprovalPolicy;
    }
  } catch (error) {
    console.warn('Inventory approval policy fetch failed:', error);
  }
  return DEFAULT_INVENTORY_APPROVAL_POLICY;
}

function auditEventDocument(
  request: ApprovalRequest,
  status: InventoryWorkflowStatus,
  actor: WorkflowActor,
  timestamp: string,
  reason: string,
  quantityDecisions: ApprovalQuantityDecision[] = [],
) {
  const decisionStatus = [
    'APPROVED',
    'REJECTED',
    'CANCELLED',
    'PROCESSING',
    'COMPLETED',
    'FAILED',
  ].includes(status);
  return {
    id: `${request.id}_${request.version}_${status}`,
    tenantId: request.tenantId,
    vendorId: request.vendorId,
    entityType: request.entityType,
    entityId: request.entityId,
    requestId: request.id,
    requester: request.requester,
    actor,
    approver: decisionStatus ? actor : null,
    requestedAt: request.requestedAt,
    decisionAt: timestamp,
    outcome: status,
    reason,
    branchId: request.branchId || null,
    branchName: request.branchName || null,
    warehouseId: request.warehouseId || null,
    warehouseName: request.warehouseName || null,
    quantityDecisions,
    version: request.version,
    timestamp,
  };
}

async function logWorkflowTransitions(
  request: ApprovalRequest,
  statuses: InventoryWorkflowStatus[],
  actor: WorkflowActor,
  reason: string,
): Promise<void> {
  for (const status of statuses) {
    await logBIEvent(
      request.vendorId,
      'INVENTORY_WORKFLOW_TRANSITION',
      `${request.entityType.replaceAll('_', ' ')} ${status}`,
      {
        tenantId: request.tenantId,
        entityType: request.entityType,
        entityId: request.entityId,
        requestId: request.id,
        status,
        version: request.version,
        reason,
        quantityDecisions: request.quantityDecisions || [],
      },
      { staffId: actor.id, staffName: actor.name, staffRole: actor.role },
    );
  }
}

function normalizeStoredApproval(
  vendorId: string,
  documentId: string,
  stored: Partial<ApprovalRequest> & {
    status?: InventoryWorkflowStatus | 'pending' | 'approved' | 'rejected';
  },
): ApprovalRequest {
    const entityType: CriticalInventoryEntityType = stored.entityType ||
      (stored.type === 'supplier_intake'
        ? 'SUPPLIER_STOCK_RECEIPT'
        : stored.type === 'stock_transfer'
          ? 'WAREHOUSE_TO_BRANCH_TRANSFER'
          : 'STOCKTAKE_ADJUSTMENT');
    const statusMap: Record<string, InventoryWorkflowStatus> = {
      pending: 'PENDING_APPROVAL',
      approved: 'COMPLETED',
      rejected: 'REJECTED',
    };
    const requester: WorkflowActor = stored.requester || {
      id: stored.requesterId || 'unknown',
      name: stored.requesterName || 'Unknown requester',
      role: stored.requesterRole || 'warehouse_staff',
    };
    const createdAt = stored.createdAt || new Date(0).toISOString();
    return {
      ...stored,
      id: stored.id || documentId,
      tenantId: stored.tenantId || vendorId,
      vendorId,
      entityType,
      entityId: stored.entityId || stored.id || documentId,
      type: stored.type || approvalTypeForEntity(entityType),
      title: stored.title || 'Inventory approval',
      description: stored.description || '',
      requesterId: requester.id,
      requesterName: requester.name,
      requesterRole: requester.role,
      requester,
      dataPayload: stored.dataPayload || {},
      status: statusMap[String(stored.status)] || stored.status || 'PENDING_APPROVAL',
      version: stored.version || 1,
      segregationOfDuties: stored.segregationOfDuties ?? true,
      notificationAudienceRoles: stored.notificationAudienceRoles || INVENTORY_WORKFLOW_POLICIES[entityType].approveRoles,
      requestedAt: stored.requestedAt || createdAt,
      createdAt,
      updatedAt: stored.updatedAt || createdAt,
    } as ApprovalRequest;
}

export async function fetchApprovalRequests(vendorId: string): Promise<ApprovalRequest[]> {
  const colRef = collection(db, 'vendors', vendorId, 'approval_requests');
  const snap = await getDocs(colRef);
  const list = snap.docs.map(snapshot =>
    normalizeStoredApproval(vendorId, snapshot.id, snapshot.data()),
  );
  list.sort((a, b) => new Date(b.requestedAt || b.createdAt).getTime() - new Date(a.requestedAt || a.createdAt).getTime());
  localStorage.setItem(`${LOCAL_STORAGE_KEY}_approvals_${vendorId}`, JSON.stringify(list));
  return list;
}

export async function createApprovalRequest(
  vendorId: string,
  submission: InventoryApprovalSubmission,
): Promise<ApprovalRequest> {
  const now = new Date().toISOString();
  const policy = await fetchInventoryApprovalPolicy(vendorId);
  if (submission.dataPayload.items?.length) {
    const canonicalProducts = await fetchProducts(vendorId);
    submission.dataPayload.items.forEach(item => assertCanonicalProductReference(canonicalProducts, item.productId));
  }
  const idempotencyKey = submission.idempotencyKey?.trim();
  const id = idempotencyKey
    ? createIdempotentApprovalRequestId(vendorId, idempotencyKey)
    : `appr_${crypto.randomUUID()}`;
  const request = createPendingInventoryRequest({
    id,
    tenantId: vendorId,
    vendorId,
    entityType: submission.entityType,
    entityId: submission.entityId,
    type: approvalTypeForEntity(submission.entityType),
    title: submission.title,
    description: submission.description,
    requesterId: submission.requester.id,
    requesterName: submission.requester.name,
    requesterRole: submission.requester.role,
    requester: submission.requester,
    branchId: submission.branchId,
    branchName: submission.branchName,
    warehouseId: submission.warehouseId,
    warehouseName: submission.warehouseName,
    dataPayload: submission.dataPayload,
    segregationOfDuties: policy.segregationOfDuties,
    notificationAudienceRoles: INVENTORY_WORKFLOW_POLICIES[submission.entityType].approveRoles,
  }, now);
  // Firestore rejects undefined values, including optional workflow context and
  // optional item metadata. Preserve the domain object while writing a clean,
  // structurally identical document with undefined properties omitted.
  const firestoreRequest = JSON.parse(JSON.stringify(request)) as ApprovalRequest;

  const persisted = await runTransaction(db, async transaction => {
    if (idempotencyKey) {
      const existingSnapshot = await transaction.get(doc(db, 'vendors', vendorId, 'approval_requests', id));
      if (existingSnapshot.exists()) {
        const existing = normalizeStoredApproval(vendorId, existingSnapshot.id, existingSnapshot.data());
        if (existing.entityType !== submission.entityType || existing.entityId !== submission.entityId) {
          throw new Error('The approval idempotency key is already assigned to a different request.');
        }
        return { request: existing, created: false };
      }
    }
    transaction.set(doc(db, 'vendors', vendorId, 'approval_requests', id), firestoreRequest);
    for (const [index, status] of (['DRAFT', 'SUBMITTED', 'PENDING_APPROVAL'] as InventoryWorkflowStatus[]).entries()) {
      const event = auditEventDocument(
        { ...request, version: index + 1 },
        status,
        submission.requester,
        now,
        'Inventory transaction submitted for approval.',
      );
      transaction.set(doc(db, 'vendors', vendorId, 'approval_events', event.id), event);
    }
    return { request: firestoreRequest, created: true };
  });

  if (!persisted.created) return persisted.request;

  await logWorkflowTransitions(
    request,
    ['DRAFT', 'SUBMITTED', 'PENDING_APPROVAL'],
    submission.requester,
    'Inventory transaction submitted for approval.',
  );
  return persisted.request;
}

function requirePayloadItems(payload: ApprovalDataPayload) {
  if (!payload.items || payload.items.length === 0) {
    throw new Error('The approval request has no inventory items.');
  }
  return payload.items;
}

export async function reviewApprovalRequest(
  vendorId: string,
  requestId: string,
  decision: 'APPROVED' | 'REJECTED' | 'CANCELLED',
  reviewer: WorkflowActor,
  expectedVersion: number,
  reason = '',
): Promise<ApprovalRequest> {
  const now = new Date().toISOString();
  const requestRef = doc(db, 'vendors', vendorId, 'approval_requests', requestId);
  const initialSnapshot = await getDoc(requestRef);
  if (!initialSnapshot.exists()) throw new Error('Approval request not found.');
  const initial = normalizeStoredApproval(vendorId, initialSnapshot.id, initialSnapshot.data());
  if (initial.entityType === 'STOCKTAKE_ADJUSTMENT') {
    const stocktakeId = String(initial.dataPayload.stocktakeId || initial.entityId);
    if (decision === 'APPROVED') {
      await httpsCallable<Record<string, unknown>, unknown>(functions, 'approveStocktake')({ vendorId, stocktakeId, commandId: `approve:${requestId}` });
      await httpsCallable<Record<string, unknown>, unknown>(functions, 'postStocktakeAdjustment')({ vendorId, stocktakeId, commandId: `post:${requestId}` });
    } else if (decision === 'REJECTED') {
      await httpsCallable<Record<string, unknown>, unknown>(functions, 'rejectStocktake')({ vendorId, stocktakeId, commandId: `reject:${requestId}`, reason: reason || 'Rejected by authorised reviewer' });
    } else {
      await httpsCallable<Record<string, unknown>, unknown>(functions, 'cancelStocktake')({ vendorId, stocktakeId, commandId: `cancel:${requestId}`, reason: reason || 'Cancelled by authorised reviewer' });
    }
    const projected = {
      ...initial,
      status: decision === 'APPROVED' ? 'COMPLETED' : decision,
      version: initial.version + 1,
      approver: reviewer,
      reviewedBy: reviewer.id,
      reviewedByName: reviewer.name,
      reviewedAt: now,
      decisionAt: now,
      outcome: decision === 'APPROVED' ? 'COMPLETED' : decision,
      reason: reason || `${decision.toLowerCase()} by authorised reviewer`,
      updatedAt: now,
    } as ApprovalRequest;
    await setDoc(requestRef, projected);
    return projected;
  }
  if (initial.entityType === 'SUPPLIER_STOCK_RECEIPT' && decision === 'APPROVED') {
    const approved = await runTransaction(db, async transaction => {
      const snapshot = await transaction.get(requestRef);
      if (!snapshot.exists()) throw new Error('Approval request not found.');
      const current = normalizeStoredApproval(vendorId, snapshot.id, snapshot.data());
      const decided = decideInventoryRequest(current, decision, reviewer, expectedVersion, reason || 'Approved by authorised receiving officer', now);
      transaction.set(requestRef, decided);
      const approvalEvent = auditEventDocument(decided, 'APPROVED', reviewer, now, decided.reason || reason);
      transaction.set(doc(db, 'vendors', vendorId, 'approval_events', approvalEvent.id), approvalEvent);
      return decided;
    });
    const payload = approved.dataPayload;
    const receiptLines = requirePayloadItems(payload).map((item, index) => {
      const quantity = Number(item.quantity || 0);
      const classification = String(item.receiptClassification || 'ACCEPTED').toUpperCase();
      const acceptedQuantity = Number(item.acceptedQuantity ?? (classification === 'ACCEPTED' ? quantity : 0));
      const damagedQuantity = Number(item.damagedQuantity ?? (classification === 'DAMAGED' ? quantity : 0));
      const quarantinedQuantity = Number(item.quarantinedQuantity ?? (classification === 'QUARANTINED' ? quantity : 0));
      const rejectedQuantity = Number(item.rejectedQuantity ?? 0);
      return {
        lineId: String((item as unknown as Record<string, unknown>).lineId || `line_${index + 1}_${item.productId}`), productId: item.productId,
        deliveredQuantity: Number(item.deliveredQuantity ?? acceptedQuantity + damagedQuantity + quarantinedQuantity + rejectedQuantity),
        acceptedQuantity, damagedQuantity, quarantinedQuantity, rejectedQuantity,
        unitCost: Number(item.unitCost || 0), unitOfMeasure: item.unitOfMeasure, batchNumber: item.batchNumber,
      };
    });
    const purchaseOrderId = String(payload.purchaseOrderId || '').trim();
    if (!purchaseOrderId) throw new Error('An issued purchase order is required for authoritative supplier receipt accounting.');
    await httpsCallable<Record<string, unknown>, unknown>(functions, 'postSupplierReceipt')({
      vendorId, receiptId: approved.entityId, commandId: `supplier-receipt-post:${requestId}`, approvalRequestId: requestId,
      warehouseId: approved.warehouseId || payload.locationId, supplierId: payload.supplierId, purchaseOrderId,
      referenceNo: payload.referenceNo || approved.entityId, lines: receiptLines,
      ...(payload.overReceiptExceptionRequested ? { overReceiptApprovalId: requestId } : {}),
    });
    const completedSnapshot = await getDoc(requestRef);
    const completed = normalizeStoredApproval(vendorId, completedSnapshot.id, completedSnapshot.data()!);
    await logWorkflowTransitions(completed, ['APPROVED', 'PROCESSING', 'COMPLETED'], reviewer, completed.reason || reason);
    return completed;
  }
  let result: ApprovalRequest;
  try {
    result = await runTransaction(db, async transaction => {
    const snapshot = await transaction.get(requestRef);
    if (!snapshot.exists()) throw new Error('Approval request not found.');
    const current = normalizeStoredApproval(vendorId, snapshot.id, snapshot.data());
    const decided = decideInventoryRequest(
      current,
      decision,
      reviewer,
      expectedVersion,
      reason || `${decision.toLowerCase()} by authorised officer`,
      now,
    );

    if (decision !== 'APPROVED') {
      if (current.entityType === 'PURCHASE_ORDER') {
        transaction.set(doc(db, 'vendors', vendorId, 'purchase_orders', current.entityId), {
          status: decision === 'REJECTED' ? 'REJECTED' : 'CANCELLED',
          updatedAt: now,
          ...(decision === 'REJECTED' ? { rejectedAt: now } : { cancelledAt: now }),
        }, { merge: true });
      }
      transaction.set(requestRef, decided);
      const event = auditEventDocument(decided, decision, reviewer, now, decided.reason || '');
      transaction.set(doc(db, 'vendors', vendorId, 'approval_events', event.id), event);
      return decided;
    }

    const processing = markInventoryRequestProcessing(decided, now);
    const payload = current.dataPayload;
    const quantityDecisions: ApprovalQuantityDecision[] = [];

    if (current.entityType === 'PURCHASE_ORDER') {
      const purchaseOrderRef = doc(db, 'vendors', vendorId, 'purchase_orders', current.entityId);
      const purchaseOrderSnapshot = await transaction.get(purchaseOrderRef);
      if (!purchaseOrderSnapshot.exists()) throw new Error('Purchase order not found.');
      if (String(purchaseOrderSnapshot.data().status) !== 'PENDING_APPROVAL') throw new Error('Only a pending purchase order can be approved.');
      transaction.set(purchaseOrderRef, { status: 'OPEN', approvedBy: reviewer, approvedAt: now, updatedAt: now }, { merge: true });
      const completedApproval = { ...markInventoryRequestCompleted(processing, now), quantityDecisions };
      transaction.set(requestRef, completedApproval);
      for (const state of [decided, processing, completedApproval]) {
        const event = auditEventDocument(state, state.status, reviewer, now, state.reason || reason, quantityDecisions);
        transaction.set(doc(db, 'vendors', vendorId, 'approval_events', event.id), event);
      }
      return completedApproval;
    }

    if (current.entityType === 'PRODUCT_COST_CHANGE') {
      const productRef = doc(db, 'vendors', vendorId, 'products', current.entityId);
      const productSnapshot = await transaction.get(productRef);
      if (!productSnapshot.exists()) throw new Error('Product no longer exists.');
      const proposedCost = Number(payload.proposedCost);
      if (!Number.isFinite(proposedCost) || proposedCost < 0) throw new Error('The proposed product cost is invalid.');
      transaction.set(productRef, { costPrice: proposedCost, updatedAt: now }, { merge: true });
      const completedApproval = { ...markInventoryRequestCompleted(processing, now), quantityDecisions };
      transaction.set(requestRef, completedApproval);
      for (const state of [decided, processing, completedApproval]) {
        const event = auditEventDocument(state, state.status, reviewer, now, state.reason || reason, quantityDecisions);
        transaction.set(doc(db, 'vendors', vendorId, 'approval_events', event.id), event);
      }
      return completedApproval;
    }

    if (current.entityType === 'WAREHOUSE_TO_BRANCH_TRANSFER') {
      const items = requirePayloadItems(payload);
      const sourceId = payload.sourceId;
      const targetBranchId = payload.targetBranchId;
      if (!sourceId || !targetBranchId) throw new Error('Transfer source and target are required.');
      const warehouseRef = doc(db, 'vendors', vendorId, 'warehouses', sourceId);
      const branchRef = doc(db, 'vendors', vendorId, 'branches', targetBranchId);
      const inventoryRefs = items.map(item =>
        doc(db, 'vendors', vendorId, 'warehouse_inventory', `${vendorId}_${sourceId}_${item.productId}`),
      );
      const [warehouseSnapshot, branchSnapshot, inventorySnapshots] = await Promise.all([
        transaction.get(warehouseRef),
        transaction.get(branchRef),
        Promise.all(inventoryRefs.map(reference => transaction.get(reference))),
      ]);
      if (!warehouseSnapshot.exists() || !branchSnapshot.exists()) {
        throw new Error('Transfer source or destination no longer exists.');
      }
      const warehouse = warehouseSnapshot.data() as Warehouse;
      const branch = branchSnapshot.data() as Branch;
      assertWarehouseToBranchRoute(vendorId, 'warehouse', warehouse, 'branch', branch);
      items.forEach((item, index) => {
        const available = inventorySnapshots[index].exists()
          ? Number(inventorySnapshots[index].data().quantity)
          : 0;
        if ((item.quantity || 0) <= 0 || (item.quantity || 0) > available) {
          throw new Error(`Insufficient warehouse stock for ${item.productName}.`);
        }
      });
      transaction.set(doc(db, 'vendors', vendorId, 'transfers', current.entityId), {
        id: current.entityId,
        vendorId,
        transferNo: current.entityId,
        sourceWarehouseId: sourceId,
        sourceWarehouseName: payload.sourceName || warehouse.name,
        targetBranchId,
        targetBranchName: payload.targetBranchName || branch.name,
        date: now,
        items: items.map(item => ({
          ...item,
          quantity: item.quantity || 0,
          quantityRequested: item.quantity || 0,
          quantityApproved: item.quantity || 0,
          quantityDispatched: 0,
          quantityReceived: 0,
        })),
        status: 'APPROVED',
        version: 1,
        notes: payload.notes || '',
        requestedAt: current.requestedAt,
        approvedAt: decided.decisionAt,
        requester: current.requester,
        approver: reviewer,
        barcodeReference: current.entityId,
        createdAt: current.requestedAt,
      });
      const completedApproval = {
        ...markInventoryRequestCompleted(processing, now),
        quantityDecisions,
      };
      transaction.set(requestRef, completedApproval);
      for (const state of [decided, processing, completedApproval]) {
        const event = auditEventDocument(
          state,
          state.status,
          reviewer,
          now,
          state.reason || reason,
          quantityDecisions,
        );
        transaction.set(doc(db, 'vendors', vendorId, 'approval_events', event.id), event);
      }
      return completedApproval;
    }

    if (
      current.entityType === 'BRANCH_TO_BRANCH_TRANSFER'
    ) {
      const items = requirePayloadItems(payload);
      const sourceId = payload.sourceId;
      const targetBranchId = payload.targetBranchId;
      if (!sourceId || !targetBranchId) throw new Error('Transfer source and target are required.');
      if (sourceId === targetBranchId) {
        throw new Error('Source and destination branches must be different.');
      }
      const sourceCollection = 'branch_inventory';
      const sourceResourceRef = doc(
        db,
        'vendors',
        vendorId,
        'branches',
        sourceId,
      );
      const targetBranchRef = doc(db, 'vendors', vendorId, 'branches', targetBranchId);
      const sourceRefs = items.map(item =>
        doc(db, 'vendors', vendorId, sourceCollection, `${vendorId}_${sourceId}_${item.productId}`),
      );
      const targetRefs = items.map(item =>
        doc(db, 'vendors', vendorId, 'branch_inventory', `${vendorId}_${targetBranchId}_${item.productId}`),
      );
      const [sourceResourceSnapshot, targetBranchSnapshot, sourceSnapshots, targetSnapshots] = await Promise.all([
        transaction.get(sourceResourceRef),
        transaction.get(targetBranchRef),
        Promise.all(sourceRefs.map(reference => transaction.get(reference))),
        Promise.all(targetRefs.map(reference => transaction.get(reference))),
      ]);
      if (
        !sourceResourceSnapshot.exists() ||
        !targetBranchSnapshot.exists() ||
        !canResourceProcessTransactions(sourceResourceSnapshot.data() as Warehouse | Branch) ||
        !canResourceProcessTransactions(targetBranchSnapshot.data() as Branch)
      ) {
        throw new Error('The transfer source and destination must both be active licensed resources.');
      }

      items.forEach((item, index) => {
        const quantity = item.quantity || 0;
        const sourceBefore = sourceSnapshots[index].exists() ? Number(sourceSnapshots[index].data().quantity) : 0;
        const targetBefore = targetSnapshots[index].exists() ? Number(targetSnapshots[index].data().quantity) : 0;
        if (quantity <= 0 || sourceBefore < quantity) {
          throw new Error(`Insufficient approved source stock for ${item.productName}.`);
        }
        const sourceAfter = sourceBefore - quantity;
        const targetAfter = targetBefore + quantity;
        transaction.set(sourceRefs[index], {
          id: sourceRefs[index].id,
          vendorId,
          branchId: sourceId,
          productId: item.productId,
          quantity: sourceAfter,
          lastUpdated: now,
        });
        transaction.set(targetRefs[index], {
          id: targetRefs[index].id,
          vendorId,
          branchId: targetBranchId,
          productId: item.productId,
          quantity: targetAfter,
          lastUpdated: now,
        });
        quantityDecisions.push(
          {
            productId: item.productId,
            productName: item.productName,
            locationType: 'branch',
            locationId: sourceId,
            beforeQuantity: sourceBefore,
            quantityDelta: -quantity,
            afterQuantity: sourceAfter,
          },
          {
            productId: item.productId,
            productName: item.productName,
            locationType: 'branch',
            locationId: targetBranchId,
            beforeQuantity: targetBefore,
            quantityDelta: quantity,
            afterQuantity: targetAfter,
          },
        );
      });

      transaction.set(doc(db, 'vendors', vendorId, 'transfers', current.entityId), {
        id: current.entityId,
        vendorId,
        transferNo: current.entityId,
        sourceWarehouseId: '',
        sourceWarehouseName: '',
        sourceBranchId: payload.sourceId,
        sourceBranchName: payload.sourceName,
        targetBranchId,
        targetBranchName: payload.targetBranchName || '',
        date: now,
        items: items.map(item => ({
          ...item,
          quantityReceived: item.quantity || 0,
        })),
        status: 'COMPLETED',
        notes: payload.notes || '',
        requestedAt: current.requestedAt,
        approvedAt: decided.decisionAt,
        dispatchedAt: now,
        requester: current.requester,
        approver: reviewer,
        barcodeReference: current.entityId,
        createdAt: current.requestedAt,
      });
    } else if (current.entityType === 'OPENING_BALANCE_ADJUSTMENT') {
      const items = requirePayloadItems(payload);
      const locationType = payload.locationType || 'branch';
      const locationId = payload.locationId;
      if (!locationId) throw new Error('Adjustment location is required.');
      const inventoryCollection = locationType === 'warehouse' ? 'warehouse_inventory' : 'branch_inventory';
      const locationRef = doc(
        db,
        'vendors',
        vendorId,
        locationType === 'warehouse' ? 'warehouses' : 'branches',
        locationId,
      );
      const inventoryRefs = items.map(item =>
        doc(db, 'vendors', vendorId, inventoryCollection, `${vendorId}_${locationId}_${item.productId}`),
      );
      const [locationSnapshot, inventorySnapshots] = await Promise.all([
        transaction.get(locationRef),
        Promise.all(inventoryRefs.map(reference => transaction.get(reference))),
      ]);
      if (
        !locationSnapshot.exists() ||
        !canResourceProcessTransactions(locationSnapshot.data() as Warehouse | Branch)
      ) {
        throw new Error('The adjustment location is not active and licensed.');
      }
      items.forEach((item, index) => {
        const before = inventorySnapshots[index].exists() ? Number(inventorySnapshots[index].data().quantity) : 0;
        const delta = item.quantityDelta || 0;
        const after = before + delta;
        if (delta === 0 || after < 0) throw new Error(`Invalid approved adjustment for ${item.productName}.`);
        transaction.set(inventoryRefs[index], {
          id: inventoryRefs[index].id,
          vendorId,
          ...(locationType === 'warehouse' ? { warehouseId: locationId } : { branchId: locationId }),
          productId: item.productId,
          quantity: after,
          lastUpdated: now,
        });
        quantityDecisions.push({
          productId: item.productId,
          productName: item.productName,
          locationType,
          locationId,
          beforeQuantity: before,
          quantityDelta: delta,
          afterQuantity: after,
        });
      });
      transaction.set(doc(db, 'vendors', vendorId, 'adjustments', current.entityId), {
        id: current.entityId,
        vendorId,
        branchId: locationType === 'branch' ? locationId : '',
        branchName: payload.locationName || '',
        type: current.entityType === 'OPENING_BALANCE_ADJUSTMENT' ? 'opening_balance' : 'recount',
        date: now,
        items,
        notes: payload.notes || '',
        status: 'COMPLETED',
        createdAt: current.requestedAt,
      });
    } else if (current.entityType === 'PURCHASE_ORDER_CANCELLATION') {
      const purchaseOrderId = payload.purchaseOrderId || current.entityId;
      const purchaseOrderRef = doc(db, 'vendors', vendorId, 'purchase_orders', purchaseOrderId);
      const purchaseOrderSnapshot = await transaction.get(purchaseOrderRef);
      if (!purchaseOrderSnapshot.exists()) throw new Error('Purchase order not found.');
      const purchaseOrderStatus = String(purchaseOrderSnapshot.data().status || '').toUpperCase();
      if (purchaseOrderStatus === 'COMPLETED' || purchaseOrderStatus === 'CANCELLED') {
        throw new Error('Only an incomplete purchase order can be cancelled.');
      }
      transaction.set(purchaseOrderRef, {
        status: 'CANCELLED',
        cancelledAt: now,
        cancelledBy: reviewer,
        cancellationReason: reason,
      }, { merge: true });
    }

    const completed = {
      ...markInventoryRequestCompleted(processing, now),
      quantityDecisions,
    };
    transaction.set(requestRef, completed);
    for (const state of [decided, processing, completed]) {
      const event = auditEventDocument(
        state,
        state.status,
        reviewer,
        now,
        state.reason || reason,
        quantityDecisions,
      );
      transaction.set(doc(db, 'vendors', vendorId, 'approval_events', event.id), event);
    }
    if (current.entityType !== 'SUPPLIER_STOCK_RECEIPT') quantityDecisions.forEach((quantity, index) => {
      const movementId = `${requestId}_${index}`;
      transaction.set(doc(db, 'vendors', vendorId, 'inventory_movements', movementId), {
        id: movementId,
        tenantId: vendorId,
        vendorId,
        requestId,
        entityType: current.entityType,
        entityId: current.entityId,
        movementType:
          current.entityType === 'SUPPLIER_STOCK_RECEIPT'
            ? 'receipt'
            : current.entityType === 'WAREHOUSE_TO_BRANCH_TRANSFER' ||
                current.entityType === 'BRANCH_TO_BRANCH_TRANSFER'
              ? quantity.quantityDelta < 0 ? 'transfer_out' : 'transfer_in'
              : 'adjustment',
        quantityBefore: quantity.beforeQuantity,
        quantityAfter: quantity.afterQuantity,
        sourceDocumentReference: current.dataPayload.referenceNo || current.entityId,
        ...quantity,
        createdAt: now,
      });
    });
    const atomicBiId = `bi_${requestId}_${completed.version}_COMPLETED`;
    transaction.set(doc(db, 'vendors', vendorId, 'bi_logs', atomicBiId), {
      id: atomicBiId,
      vendorId,
      eventType: 'INVENTORY_WORKFLOW_TRANSITION',
      actionSummary: `${current.entityType.replaceAll('_', ' ')} completed atomically`,
      staffId: reviewer.id,
      staffName: reviewer.name,
      staffRole: reviewer.role,
      branchId: current.branchId || null,
      branchName: current.branchName || null,
      details: {
        tenantId: vendorId,
        entityType: current.entityType,
        entityId: current.entityId,
        requestId,
        status: 'COMPLETED',
        outcome: 'COMPLETED',
        version: completed.version,
        quantityDecisions,
      },
      riskScore: current.entityType === 'STOCKTAKE_ADJUSTMENT' ? 75 : 40,
      isAnomaly: current.entityType === 'STOCKTAKE_ADJUSTMENT',
      timestamp: now,
    });
    return completed;
    });
  } catch (error) {
    if (error instanceof InventoryWorkflowError) throw error;
    const failureReason = error instanceof Error ? error.message : 'Atomic inventory processing failed.';
    const failed = await runTransaction(db, async transaction => {
      const snapshot = await transaction.get(requestRef);
      if (!snapshot.exists()) throw error;
      const current = normalizeStoredApproval(vendorId, snapshot.id, snapshot.data());
      if (current.status !== 'PENDING_APPROVAL' || current.version !== expectedVersion) throw error;
      const failedRequest: ApprovalRequest = {
        ...current,
        status: 'FAILED',
        version: current.version + 1,
        approver: reviewer,
        reviewedBy: reviewer.id,
        reviewedByName: reviewer.name,
        reviewedAt: now,
        reviewComment: failureReason,
        decisionAt: now,
        outcome: 'FAILED',
        reason: failureReason,
        updatedAt: now,
      };
      transaction.set(requestRef, failedRequest);
      const event = auditEventDocument(failedRequest, 'FAILED', reviewer, now, failureReason);
      transaction.set(doc(db, 'vendors', vendorId, 'approval_events', event.id), event);
      return failedRequest;
    });
    await logWorkflowTransitions(failed, ['FAILED'], reviewer, failureReason);
    throw error;
  }

  const statuses: InventoryWorkflowStatus[] = decision === 'APPROVED'
    ? ['APPROVED', 'PROCESSING', 'COMPLETED']
    : [decision];
  await logWorkflowTransitions(result, statuses, reviewer, result.reason || reason);
  if (result.entityType === 'PURCHASE_ORDER') {
    await logBIEvent(
      vendorId,
      decision === 'APPROVED' ? 'PURCHASE_ORDER_APPROVED' : 'PURCHASE_ORDER_REJECTED',
      `Purchase order ${result.dataPayload.purchaseOrderNumber || result.entityId} ${decision.toLowerCase()}`,
      { purchaseOrderId: result.entityId, decision, inventoryChanged: false, reason: result.reason || reason },
      { staffId: reviewer.id, staffName: reviewer.name, staffRole: reviewer.role },
    );
  }
  if (result.entityType === 'PRODUCT_COST_CHANGE' && decision === 'APPROVED') {
    await logBIEvent(vendorId, 'PRODUCT_PRICE_CHANGED', `Approved cost change for ${String(result.dataPayload.sku || result.entityId)}`, { productId: result.entityId, previousCost: Number(result.dataPayload.previousCost), newCost: Number(result.dataPayload.proposedCost), averageCost: Number(result.dataPayload.averageCost), approvalRequestId: result.id, approved: true }, { staffId: reviewer.id, staffName: reviewer.name, staffRole: reviewer.role });
  }
  return result;
}

// Update Vendor Profile Settings
export async function updateVendorProfile(vendorId: string, updates: Partial<VendorProfile>): Promise<VendorProfile> {
  const current = getLocalVendor(vendorId) || {
    id: vendorId,
    email: '',
    businessName: 'My POS Business',
    address: '123 Commerce St',
    phone: '',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    currency: '$',
    taxRate: 8,
    onboardingCompleted: true,
  };

  const updated: VendorProfile = {
    ...current,
    ...updates,
    updatedAt: new Date().toISOString(),
  };

  saveLocalVendor(vendorId, updated);
  try {
    await setDoc(doc(db, 'vendors', vendorId), updated, { merge: true });
  } catch (e) {
    console.warn('Firestore vendor profile update warning:', e);
  }

  return updated;
}

// Hardware Settings Storage
export async function fetchHardwareSettings(vendorId: string): Promise<HardwareSettings> {
  const defaultHardware: HardwareSettings = {
    printerType: 'thermal_80mm',
    printerName: 'Epson TM-T88VI Thermal POS Printer',
    autoPrintReceipt: true,
    barcodeScannerMode: 'usb_hid',
    cashDrawerAutoKick: true,
    cashDrawerKickPin: 'pin_2',
    customerPoleDisplay: true,
    customerPoleMessage: 'Thank you for shopping with us!',
    msrCardReaderEnabled: true,
    scaleIntegration: false,
  };

  try {
    const docRef = doc(db, 'vendors', vendorId, 'settings', 'hardware');
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      return snap.data() as HardwareSettings;
    }
  } catch (e) {
    console.warn('Firestore fetch hardware settings warning:', e);
  }

  const raw = localStorage.getItem(`${LOCAL_STORAGE_KEY}_hardware_${vendorId}`);
  if (raw) return JSON.parse(raw);

  localStorage.setItem(`${LOCAL_STORAGE_KEY}_hardware_${vendorId}`, JSON.stringify(defaultHardware));
  return defaultHardware;
}

export async function saveHardwareSettings(vendorId: string, settings: HardwareSettings): Promise<HardwareSettings> {
  localStorage.setItem(`${LOCAL_STORAGE_KEY}_hardware_${vendorId}`, JSON.stringify(settings));
  try {
    await setDoc(doc(db, 'vendors', vendorId, 'settings', 'hardware'), settings);
  } catch (e) {
    console.warn('Firestore save hardware settings warning:', e);
  }
  return settings;
}

// Custom Roles Management
export async function fetchCustomRoles(vendorId: string): Promise<CustomRoleDefinition[]> {
  const defaultRoles: CustomRoleDefinition[] = [
    {
      roleKey: 'sysadmin',
      roleName: 'System Administrator',
      description: 'Full system control, hardware config, security rules, and menu management.',
      defaultGrantedMenuIds: ['desk', 'pos', 'warehouse', 'transfers', 'branches', 'products', 'reports', 'approvals', 'staff', 'bi_audit', 'settings'],
      canApproveTransactions: true,
      isSystemRole: true,
    },
    {
      roleKey: 'manager',
      roleName: 'Store Manager',
      description: 'Branch oversight, inventory adjustments, staff scheduling, and high-value approvals.',
      defaultGrantedMenuIds: ['desk', 'pos', 'warehouse', 'transfers', 'branches', 'products', 'reports', 'approvals', 'settings'],
      canApproveTransactions: true,
      isSystemRole: true,
    },
    {
      roleKey: 'cashier',
      roleName: 'POS Cashier',
      description: 'Front-desk point of sale, register shift open/close, and basic receipt reprints.',
      defaultGrantedMenuIds: ['desk', 'pos', 'reports'],
      canApproveTransactions: false,
      isSystemRole: true,
    },
    {
      roleKey: 'warehouse_staff',
      roleName: 'Inventory & Warehouse Specialist',
      description: 'Stock intake, warehouse transfers, recount logs, and dispatch approvals.',
      defaultGrantedMenuIds: ['desk', 'warehouse', 'transfers', 'products', 'approvals'],
      canApproveTransactions: false,
      isSystemRole: true,
    },
  ];

  try {
    const docRef = doc(db, 'vendors', vendorId, 'settings', 'roles');
    const snap = await getDoc(docRef);
    if (snap.exists() && snap.data().roles) {
      return snap.data().roles as CustomRoleDefinition[];
    }
  } catch (e) {
    console.warn('Firestore fetch custom roles warning:', e);
  }

  const raw = localStorage.getItem(`${LOCAL_STORAGE_KEY}_custom_roles_${vendorId}`);
  if (raw) return JSON.parse(raw);

  localStorage.setItem(`${LOCAL_STORAGE_KEY}_custom_roles_${vendorId}`, JSON.stringify(defaultRoles));
  return defaultRoles;
}

export async function saveCustomRoles(vendorId: string, roles: CustomRoleDefinition[]): Promise<CustomRoleDefinition[]> {
  localStorage.setItem(`${LOCAL_STORAGE_KEY}_custom_roles_${vendorId}`, JSON.stringify(roles));
  try {
    await setDoc(doc(db, 'vendors', vendorId, 'settings', 'roles'), { roles });
  } catch (e) {
    console.warn('Firestore save custom roles warning:', e);
  }
  return roles;
}

// ==========================================
// DELIVERY FLEET & DISPATCH SERVICES
// ==========================================

export async function fetchDeliveryCouriers(vendorId: string): Promise<DeliveryCourier[]> {
  const defaultCouriers: DeliveryCourier[] = [
    {
      id: 'courier_01',
      vendorId,
      name: 'Michael Scott',
      phone: '+1 (555) 234-5678',
      vehicleType: 'biker',
      vehiclePlate: 'BK-902-NY',
      defaultDeliveryFee: 5.00,
      status: 'available',
      createdAt: new Date().toISOString()
    },
    {
      id: 'courier_02',
      vendorId,
      name: 'James Rodriguez',
      phone: '+1 (555) 987-6543',
      vehicleType: 'car',
      vehiclePlate: 'CR-881-TX',
      defaultDeliveryFee: 8.50,
      status: 'available',
      createdAt: new Date().toISOString()
    },
    {
      id: 'courier_03',
      vendorId,
      name: 'David Miller (Express Van)',
      phone: '+1 (555) 456-7890',
      vehicleType: 'van',
      vehiclePlate: 'VN-104-CA',
      defaultDeliveryFee: 15.00,
      status: 'available',
      createdAt: new Date().toISOString()
    }
  ];

  try {
    const q = collection(db, 'vendors', vendorId, 'delivery_couriers');
    const snap = await getDocs(q);
    if (!snap.empty) {
      return snap.docs.map(doc => doc.data() as DeliveryCourier);
    }
  } catch (e) {
    console.warn('Firestore fetch delivery couriers warning:', e);
  }

  const raw = localStorage.getItem(`${LOCAL_STORAGE_KEY}_couriers_${vendorId}`);
  if (raw) return JSON.parse(raw);

  localStorage.setItem(`${LOCAL_STORAGE_KEY}_couriers_${vendorId}`, JSON.stringify(defaultCouriers));
  return defaultCouriers;
}

export async function saveDeliveryCourier(vendorId: string, courierData: Partial<DeliveryCourier>): Promise<DeliveryCourier> {
  const id = courierData.id || `courier_${Math.random().toString(36).substring(2, 9)}`;
  const now = new Date().toISOString();

  const fullCourier: DeliveryCourier = {
    id,
    vendorId,
    name: courierData.name || 'Unnamed Courier',
    phone: courierData.phone || '',
    vehicleType: courierData.vehicleType || 'biker',
    vehiclePlate: courierData.vehiclePlate || 'TEMP-PLATE',
    defaultDeliveryFee: Number(courierData.defaultDeliveryFee) || 5.00,
    status: courierData.status || 'available',
    assignedBranchId: courierData.assignedBranchId || '',
    assignedBranchName: courierData.assignedBranchName || '',
    createdAt: courierData.createdAt || now
  };

  try {
    await setDoc(doc(db, 'vendors', vendorId, 'delivery_couriers', id), fullCourier);
  } catch (e) {
    console.warn('Firestore save courier warning:', e);
  }

  const current = await fetchDeliveryCouriers(vendorId);
  const updated = current.some(c => c.id === id)
    ? current.map(c => c.id === id ? fullCourier : c)
    : [fullCourier, ...current];

  localStorage.setItem(`${LOCAL_STORAGE_KEY}_couriers_${vendorId}`, JSON.stringify(updated));
  return fullCourier;
}

export async function deleteDeliveryCourier(vendorId: string, courierId: string): Promise<void> {
  const current = await fetchDeliveryCouriers(vendorId);
  const updated = current.filter(c => c.id !== courierId);
  localStorage.setItem(`${LOCAL_STORAGE_KEY}_couriers_${vendorId}`, JSON.stringify(updated));
}

export async function fetchDeliveryDispatches(vendorId: string): Promise<DeliveryDispatchMessage[]> {
  try {
    const q = collection(db, 'vendors', vendorId, 'delivery_dispatches');
    const snap = await getDocs(q);
    if (!snap.empty) {
      return snap.docs
        .map(doc => doc.data() as DeliveryDispatchMessage)
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }
  } catch (e) {
    console.warn('Firestore fetch dispatches warning:', e);
  }

  const raw = localStorage.getItem(`${LOCAL_STORAGE_KEY}_dispatches_${vendorId}`);
  return raw ? JSON.parse(raw) : [];
}

export async function createDeliveryDispatch(
  vendorId: string,
  dispatchData: Omit<DeliveryDispatchMessage, 'id' | 'createdAt'>
): Promise<DeliveryDispatchMessage> {
  const id = `dispatch_${Math.random().toString(36).substring(2, 9)}`;
  const now = new Date().toISOString();

  const fullDispatch: DeliveryDispatchMessage = {
    ...dispatchData,
    id,
    createdAt: now
  };

  try {
    await setDoc(doc(db, 'vendors', vendorId, 'delivery_dispatches', id), fullDispatch);
  } catch (e) {
    console.warn('Firestore save dispatch warning:', e);
  }

  const current = await fetchDeliveryDispatches(vendorId);
  const updated = [fullDispatch, ...current];
  localStorage.setItem(`${LOCAL_STORAGE_KEY}_dispatches_${vendorId}`, JSON.stringify(updated));

  // Mark courier as 'on_delivery'
  const couriers = await fetchDeliveryCouriers(vendorId);
  const targetCourier = couriers.find(c => c.id === dispatchData.courierId);
  if (targetCourier) {
    await saveDeliveryCourier(vendorId, { ...targetCourier, status: 'on_delivery' });
  }

  return fullDispatch;
}

export async function updateDispatchStatus(
  vendorId: string,
  dispatchId: string,
  status: 'dispatched' | 'collected' | 'in_transit' | 'delivered'
): Promise<void> {
  const current = await fetchDeliveryDispatches(vendorId);
  const updated = current.map(d => {
    if (d.id === dispatchId) {
      return { ...d, status };
    }
    return d;
  });

  localStorage.setItem(`${LOCAL_STORAGE_KEY}_dispatches_${vendorId}`, JSON.stringify(updated));

  // If status is delivered, mark courier available
  const targetDispatch = current.find(d => d.id === dispatchId);
  if (targetDispatch && status === 'delivered') {
    const couriers = await fetchDeliveryCouriers(vendorId);
    const targetCourier = couriers.find(c => c.id === targetDispatch.courierId);
    if (targetCourier) {
      await saveDeliveryCourier(vendorId, { ...targetCourier, status: 'available' });
    }
  }
}

// ==================== TERMINAL SHIFT MANAGEMENT ====================

export async function fetchActiveShift(
  vendorId: string,
  terminalId: string
): Promise<TerminalShift | null> {
  try {
    const colRef = collection(db, 'vendors', vendorId, 'shifts');
    const q = query(colRef, where('terminalId', '==', terminalId), where('status', '==', 'open'));
    const snap = await getDocs(colRef);
    if (!snap.empty) {
      return snap.docs[0].data() as TerminalShift;
    }
  } catch (e) {
    console.warn('Firestore fetchActiveShift warning:', e);
  }

  const raw = localStorage.getItem(`${LOCAL_STORAGE_KEY}_shifts_${vendorId}`);
  if (raw) {
    const list: TerminalShift[] = JSON.parse(raw);
    const found = list.find(s => s.terminalId === terminalId && s.status === 'open');
    if (found) return found;
  }

  return null;
}

export async function openTerminalShift(
  vendorId: string,
  shiftData: {
    branchId: string;
    branchName?: string;
    terminalId: string;
    terminalName?: string;
    staffId: string;
    staffName: string;
    openingCash: number;
    openingNotes?: string;
  }
): Promise<TerminalShift> {
  const id = `shift_${Math.random().toString(36).substring(2, 9)}`;
  const now = new Date().toISOString();

  const newShift: TerminalShift = {
    id,
    vendorId,
    branchId: shiftData.branchId,
    branchName: shiftData.branchName || 'Main Branch',
    terminalId: shiftData.terminalId,
    terminalName: shiftData.terminalName || 'Main Register',
    staffId: shiftData.staffId,
    staffName: shiftData.staffName,
    openedAt: now,
    openingCash: Number(shiftData.openingCash) || 0,
    totalSales: 0,
    cashSales: 0,
    cardSales: 0,
    mobileSales: 0,
    transactionCount: 0,
    openingNotes: shiftData.openingNotes || '',
    status: 'open'
  };

  try {
    await setDoc(doc(db, 'vendors', vendorId, 'shifts', id), newShift);
  } catch (e) {
    console.warn('Firestore openTerminalShift error:', e);
  }

  const raw = localStorage.getItem(`${LOCAL_STORAGE_KEY}_shifts_${vendorId}`);
  const existing: TerminalShift[] = raw ? JSON.parse(raw) : [];
  localStorage.setItem(`${LOCAL_STORAGE_KEY}_shifts_${vendorId}`, JSON.stringify([newShift, ...existing]));

  await logBIEvent(
    vendorId,
    'SHIFT_OPENED',
    `Terminal Shift opened by ${shiftData.staffName} with float $${shiftData.openingCash.toFixed(2)}`,
    { shiftId: id, openingCash: shiftData.openingCash },
    { staffId: shiftData.staffId, staffName: shiftData.staffName }
  );

  return newShift;
}

export async function recordOrderToShift(
  vendorId: string,
  shiftId: string,
  order: Order
): Promise<TerminalShift | null> {
  const raw = localStorage.getItem(`${LOCAL_STORAGE_KEY}_shifts_${vendorId}`);
  const shifts: TerminalShift[] = raw ? JSON.parse(raw) : [];
  const index = shifts.findIndex(s => s.id === shiftId);

  let targetShift: TerminalShift | null = null;

  if (index >= 0) {
    const current = shifts[index];
    const isCash = order.paymentMethod === 'cash';
    const isCard = order.paymentMethod === 'card';
    const isMobile = order.paymentMethod === 'mobile_money';

    targetShift = {
      ...current,
      totalSales: current.totalSales + order.totalAmount,
      cashSales: isCash ? current.cashSales + order.totalAmount : current.cashSales,
      cardSales: isCard ? current.cardSales + order.totalAmount : current.cardSales,
      mobileSales: isMobile ? current.mobileSales + order.totalAmount : current.mobileSales,
      transactionCount: current.transactionCount + 1
    };

    shifts[index] = targetShift;
    localStorage.setItem(`${LOCAL_STORAGE_KEY}_shifts_${vendorId}`, JSON.stringify(shifts));

    try {
      await setDoc(doc(db, 'vendors', vendorId, 'shifts', shiftId), targetShift);
    } catch (e) {
      console.warn('Firestore update shift sales error:', e);
    }
  }

  return targetShift;
}

export async function closeTerminalShift(
  vendorId: string,
  shiftId: string,
  closingCash: number,
  closingNotes?: string
): Promise<TerminalShift> {
  const now = new Date().toISOString();
  const raw = localStorage.getItem(`${LOCAL_STORAGE_KEY}_shifts_${vendorId}`);
  const shifts: TerminalShift[] = raw ? JSON.parse(raw) : [];
  const index = shifts.findIndex(s => s.id === shiftId);

  let currentShift: TerminalShift;
  if (index >= 0) {
    currentShift = shifts[index];
  } else {
    currentShift = {
      id: shiftId,
      vendorId,
      branchId: '',
      terminalId: '',
      staffId: '',
      staffName: 'Staff',
      openedAt: now,
      openingCash: 0,
      totalSales: 0,
      cashSales: 0,
      cardSales: 0,
      mobileSales: 0,
      transactionCount: 0,
      status: 'open'
    };
  }

  const expectedCash = currentShift.openingCash + currentShift.cashSales;
  const cashDiscrepancy = closingCash - expectedCash;

  const closedShift: TerminalShift = {
    ...currentShift,
    closedAt: now,
    closingCash,
    expectedCash,
    cashDiscrepancy,
    closingNotes: closingNotes || '',
    status: 'closed'
  };

  if (index >= 0) {
    shifts[index] = closedShift;
  } else {
    shifts.unshift(closedShift);
  }

  localStorage.setItem(`${LOCAL_STORAGE_KEY}_shifts_${vendorId}`, JSON.stringify(shifts));

  try {
    await setDoc(doc(db, 'vendors', vendorId, 'shifts', shiftId), closedShift);
  } catch (e) {
    console.warn('Firestore closeTerminalShift error:', e);
  }

  await logBIEvent(
    vendorId,
    'SHIFT_CLOSED',
    `Shift ${shiftId} closed. Expected Cash: $${expectedCash.toFixed(2)}, Actual: $${closingCash.toFixed(2)}, Variance: $${cashDiscrepancy.toFixed(2)}`,
    { shiftId, expectedCash, closingCash, discrepancy: cashDiscrepancy },
    { staffId: currentShift.staffId, staffName: currentShift.staffName }
  );

  return closedShift;
}

export async function fetchShiftHistory(vendorId: string): Promise<TerminalShift[]> {
  try {
    const colRef = collection(db, 'vendors', vendorId, 'shifts');
    const snap = await getDocs(colRef);
    if (!snap.empty) {
      const list = snap.docs.map(d => d.data() as TerminalShift);
      return list.sort((a, b) => new Date(b.openedAt).getTime() - new Date(a.openedAt).getTime());
    }
  } catch (e) {
    console.warn('Firestore fetchShiftHistory warning:', e);
  }

  const raw = localStorage.getItem(`${LOCAL_STORAGE_KEY}_shifts_${vendorId}`);
  return raw ? JSON.parse(raw) : [];
}

// ==========================================
// VENDOR BILLING, PLANS & INVOICING ENGINE
// ==========================================

// Console Controlled Subscription Plans
export const DEFAULT_BILLING_PLANS: BillingPlan[] = [
  {
    id: 'starter_free',
    name: 'Starter POS (Free)',
    priceMonthly: 0,
    billingPeriodMonths: 1,
    currency: '$',
    description: 'Essential single-branch POS for small retail shops and pop-up counters.',
    features: [
      '1 Active Store Branch',
      'Up to 2 Cashier Terminals',
      'Basic Product Catalog & Barcode Scanner',
      'Offline Sale Syncing',
      'Daily Sales Reports'
    ],
    maxWarehouses: 1,
    maxBranches: 1,
    maxTerminals: 2,
    maxStaff: 3,
    status: 'active',
    createdAt: new Date().toISOString()
  },
  {
    id: 'pro_commerce',
    name: 'Pro Commerce & Multi-Terminal',
    priceMonthly: 49,
    billingPeriodMonths: 1,
    currency: '$',
    description: 'Advanced retail management with inventory transfers & delivery fleet.',
    features: [
      'Up to 3 Active Store Branches',
      'Unlimited POS Terminals & Shift Audits',
      'Delivery Fleet Dispatch Integration',
      'Central Warehouse & Inter-Branch Transfers',
      'Manager Approval Workflows & BI Audit',
      '7-Day Advance Auto-Invoice Generation'
    ],
    maxWarehouses: 1,
    maxBranches: 3,
    maxTerminals: 999,
    maxStaff: 10,
    isPopular: true,
    status: 'active',
    createdAt: new Date().toISOString()
  },
  {
    id: 'enterprise_fleet',
    name: 'Enterprise Chain & Multi-Store',
    priceMonthly: 129,
    billingPeriodMonths: 1,
    currency: '$',
    description: 'Complete enterprise chain solution with dedicated support & consultancy.',
    features: [
      'Unlimited Branches & Central Warehouses',
      'Unlimited Staff & Custom Security Roles',
      'Priority Delivery Dispatch Engine',
      'Automated EOD Z-Report Auditing',
      'Quarterly Onsite Stocktake Audit Discount',
      'Dedicated Account Manager & SLA'
    ],
    maxWarehouses: 999,
    maxBranches: 20,
    maxTerminals: 999,
    maxStaff: 100,
    status: 'active',
    createdAt: new Date().toISOString()
  }
];

// Organization Services Offered to Vendors
export const DEFAULT_ORGANIZATION_SERVICES: BillingServiceAddon[] = [
  {
    id: 'srv_stocktake',
    title: 'Onsite Physical Stocktake & Barcode Audit',
    category: 'stocktake',
    description: 'Our certified inventory specialists conduct full physical counts, serial tagging, and discrepancy variance auditing in your store.',
    price: 199,
    priceType: 'one_time',
    deliverables: [
      'Full Physical Headcount of all SKUs & Shelves',
      'Variance Reconciliation Report vs. POS System',
      'Barcode Labeling & Bin Location Tagging',
      'Zero-Downtime After-Hours Audit Option'
    ]
  },
  {
    id: 'srv_consultancy',
    title: 'Retail POS & Business Strategy Consultancy',
    category: 'consultancy',
    description: '1-on-1 strategy sessions with retail operations experts to optimize stock turnover, cash register controls, and VAT tax compliance.',
    price: 149,
    priceType: 'one_time',
    deliverables: [
      '2-Hour Deep Dive Operations Audit',
      'Cashier Anti-Theft & Shift Shrinkage Control Framework',
      'Tax & VAT Configuration Review',
      'Custom KPI Dashboard Setup'
    ]
  },
  {
    id: 'srv_hardware_setup',
    title: 'POS Hardware & Thermal Printer Onsite Setup',
    category: 'hardware',
    description: 'Professional installation and pairing of thermal receipt printers, barcode scanners, cash drawers, and network pass-throughs.',
    price: 99,
    priceType: 'one_time',
    deliverables: [
      'ESC/POS Thermal Printer Configuration (80mm / 58mm)',
      'USB/Bluetooth Barcode Scanner Calibration',
      'Automatic Cash Drawer RJ11 Trigger Setup',
      'Staff Hardware Handover & Quick Guide'
    ]
  },
  {
    id: 'srv_dedicated_support',
    title: '24/7 Dedicated SLA Technician Support',
    category: 'support',
    description: 'Priority line access to senior engineers, 15-minute emergency SLA response, and instant remote terminal troubleshooting.',
    price: 39,
    priceType: 'monthly',
    deliverables: [
      'Dedicated Direct Phone & WhatsApp Support Line',
      '15-Minute Critical Incident SLA',
      'Remote Desktop & Terminal Intervention',
      'Monthly Health Check & System Tune-Up'
    ]
  }
];

// Fetch Console Controlled Plans
export async function fetchBillingPlans(): Promise<BillingPlan[]> {
  try {
    const colRef = collection(db, 'platform_plans');
    const snap = await getDocs(colRef);
    if (!snap.empty) {
      return snap.docs.map(d => d.data() as BillingPlan);
    }
  } catch (e) {
    console.warn('Firestore fetchBillingPlans warning:', e);
  }

  const raw = localStorage.getItem(`${LOCAL_STORAGE_KEY}_platform_plans`);
  if (raw) {
    return JSON.parse(raw);
  }

  localStorage.setItem(`${LOCAL_STORAGE_KEY}_platform_plans`, JSON.stringify(DEFAULT_BILLING_PLANS));
  return DEFAULT_BILLING_PLANS;
}

// Save/Update Console Plan (Console Admin Control)
export async function saveBillingPlan(plan: BillingPlan): Promise<BillingPlan[]> {
  const current = await fetchBillingPlans();
  const existingIndex = current.findIndex(p => p.id === plan.id);
  let updatedList: BillingPlan[];
  if (existingIndex >= 0) {
    updatedList = [...current];
    updatedList[existingIndex] = plan;
  } else {
    updatedList = [...current, plan];
  }

  localStorage.setItem(`${LOCAL_STORAGE_KEY}_platform_plans`, JSON.stringify(updatedList));

  try {
    await setDoc(doc(db, 'platform_plans', plan.id), plan);
  } catch (e) {
    console.warn('Firestore saveBillingPlan error:', e);
  }

  return updatedList;
}

// Fetch Vendor Subscription
export async function fetchVendorSubscription(vendorId: string): Promise<VendorSubscription> {
  const localKey = `${LOCAL_STORAGE_KEY}_subscription_${vendorId}`;
  try {
    const docRef = doc(db, 'vendors', vendorId, 'billing', 'subscription');
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      return snap.data() as VendorSubscription;
    }
  } catch (e) {
    console.warn('Firestore fetchVendorSubscription warning:', e);
  }

  const raw = localStorage.getItem(localKey);
  if (raw) {
    return JSON.parse(raw);
  }

  // Every vendor starts on the minimum Starter entitlement.
  const now = new Date();
  const expiry = new Date();
  expiry.setFullYear(now.getFullYear() + 10);

  const defaultSub: VendorSubscription = {
    id: `sub_${vendorId}`,
    vendorId,
    planId: 'starter_free',
    planName: 'Starter POS (Free)',
    priceMonthly: 0,
    billingPeriodMonths: 1,
    startDate: now.toISOString(),
    expiryDate: expiry.toISOString(),
    autoRenew: true,
    status: 'active',
  };

  localStorage.setItem(localKey, JSON.stringify(defaultSub));
  try {
    await setDoc(doc(db, 'vendors', vendorId, 'billing', 'subscription'), defaultSub);
  } catch (e) {
    console.warn('Firestore save default sub warning:', e);
  }

  return defaultSub;
}

// Update Vendor Subscription
export async function updateVendorSubscription(vendorId: string, updates: Partial<VendorSubscription>): Promise<VendorSubscription> {
  const current = await fetchVendorSubscription(vendorId);
  const updated: VendorSubscription = {
    ...current,
    ...updates,
  };

  localStorage.setItem(`${LOCAL_STORAGE_KEY}_subscription_${vendorId}`, JSON.stringify(updated));

  try {
    await setDoc(doc(db, 'vendors', vendorId, 'billing', 'subscription'), updated);
  } catch (e) {
    console.warn('Firestore updateVendorSubscription error:', e);
  }

  return updated;
}

// Fetch Invoices & Auto-Check 7-day Advance Rule
export async function fetchVendorInvoices(vendorId: string): Promise<VendorInvoice[]> {
  let invoices: VendorInvoice[] = [];
  try {
    const colRef = collection(db, 'vendors', vendorId, 'invoices');
    const snap = await getDocs(colRef);
    if (!snap.empty) {
      invoices = snap.docs.map(d => d.data() as VendorInvoice);
    }
  } catch (e) {
    console.warn('Firestore fetchVendorInvoices warning:', e);
  }

  if (invoices.length === 0) {
    const raw = localStorage.getItem(`${LOCAL_STORAGE_KEY}_invoices_${vendorId}`);
    invoices = raw ? JSON.parse(raw) : [];
  }

  // Execute 7-Day Advance Renewal Auto-Invoice Generator Check
  const updatedInvoices = await checkAndGenerate7DayRenewalInvoice(vendorId, invoices);
  return updatedInvoices.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

// 7-Day Advance Invoice Auto Generator
export async function checkAndGenerate7DayRenewalInvoice(vendorId: string, existingInvoices: VendorInvoice[]): Promise<VendorInvoice[]> {
  const sub = await fetchVendorSubscription(vendorId);
  if (sub.priceMonthly <= 0) return existingInvoices; // Free plan doesn't need invoices

  const now = new Date();
  const expiry = new Date(sub.expiryDate);
  const diffTime = expiry.getTime() - now.getTime();
  const daysRemaining = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  // If expiry is within 7 days (or overdue)
  if (daysRemaining <= 7) {
    // Check if an auto-generated invoice already exists for this renewal cycle
    const currentPeriodTag = expiry.toISOString().slice(0, 10);
    const existingAutoInv = existingInvoices.find(inv => 
      inv.is7DayAutoGenerated && inv.periodEnd === sub.expiryDate
    );

    if (!existingAutoInv) {
      // Auto Generate Renewal Invoice 7 days before expiry!
      const taxRate = 8;
      const subtotal = sub.priceMonthly * sub.billingPeriodMonths;
      const taxAmount = (subtotal * taxRate) / 100;
      const totalAmount = subtotal + taxAmount;

      const newInv: VendorInvoice = {
        id: `inv_auto_${Date.now()}`,
        vendorId,
        invoiceNumber: `INV-${now.getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`,
        issueDate: now.toISOString(),
        dueDate: sub.expiryDate,
        periodStart: sub.expiryDate,
        periodEnd: new Date(expiry.getTime() + sub.billingPeriodMonths * 30 * 24 * 60 * 60 * 1000).toISOString(),
        items: [
          {
            id: `item_renew_${Date.now()}`,
            description: `Plan Renewal: ${sub.planName} (${sub.billingPeriodMonths} Month Period)`,
            category: 'plan_renewal',
            unitPrice: sub.priceMonthly,
            quantity: sub.billingPeriodMonths,
            amount: subtotal
          }
        ],
        subtotal,
        taxRate,
        taxAmount,
        totalAmount,
        currency: '$',
        status: 'unpaid_due',
        is7DayAutoGenerated: true,
        notes: `Auto-generated 7 days prior to plan expiry (${expiry.toLocaleDateString()}). Please remit payment to prevent register suspension.`,
        createdAt: now.toISOString()
      };

      const newList = [newInv, ...existingInvoices];
      localStorage.setItem(`${LOCAL_STORAGE_KEY}_invoices_${vendorId}`, JSON.stringify(newList));

      try {
        await setDoc(doc(db, 'vendors', vendorId, 'invoices', newInv.id), newInv);
      } catch (e) {
        console.warn('Firestore auto-invoice save error:', e);
      }

      await logBIEvent(
        vendorId,
        'INVOICE_AUTO_GENERATED',
        `7-Day Advance Renewal Invoice ${newInv.invoiceNumber} generated for $${newInv.totalAmount.toFixed(2)}`,
        { invoiceId: newInv.id, daysRemaining, dueDate: newInv.dueDate }
      );

      return newList;
    }
  }

  return existingInvoices;
}

// Create Custom Invoice / Service Order Invoice
export async function createVendorInvoice(vendorId: string, invoiceData: Omit<VendorInvoice, 'id' | 'vendorId' | 'createdAt'>): Promise<VendorInvoice> {
  const newInvoice: VendorInvoice = {
    ...invoiceData,
    id: `inv_${Date.now()}`,
    vendorId,
    createdAt: new Date().toISOString()
  };

  const existing = await fetchVendorInvoices(vendorId);
  const updatedList = [newInvoice, ...existing];

  localStorage.setItem(`${LOCAL_STORAGE_KEY}_invoices_${vendorId}`, JSON.stringify(updatedList));

  try {
    await setDoc(doc(db, 'vendors', vendorId, 'invoices', newInvoice.id), newInvoice);
  } catch (e) {
    console.warn('Firestore createVendorInvoice error:', e);
  }

  await logBIEvent(
    vendorId,
    'INVOICE_CREATED',
    `Invoice ${newInvoice.invoiceNumber} created for $${newInvoice.totalAmount.toFixed(2)}`,
    { invoiceId: newInvoice.id, totalAmount: newInvoice.totalAmount }
  );

  return newInvoice;
}

// Pay Invoice & Extend Subscription Expiry Date
export async function payVendorInvoice(
  vendorId: string,
  invoiceId: string,
  paymentMethod: 'credit_card' | 'mobile_money' | 'bank_transfer' | 'cash'
): Promise<{ invoice: VendorInvoice; subscription: VendorSubscription }> {
  const invoices = await fetchVendorInvoices(vendorId);
  const targetIndex = invoices.findIndex(i => i.id === invoiceId);

  if (targetIndex < 0) throw new Error('Invoice not found');

  const now = new Date().toISOString();
  const updatedInv: VendorInvoice = {
    ...invoices[targetIndex],
    status: 'paid',
    paymentMethod,
    paidAt: now
  };

  invoices[targetIndex] = updatedInv;
  localStorage.setItem(`${LOCAL_STORAGE_KEY}_invoices_${vendorId}`, JSON.stringify(invoices));

  try {
    await setDoc(doc(db, 'vendors', vendorId, 'invoices', invoiceId), updatedInv);
  } catch (e) {
    console.warn('Firestore payVendorInvoice error:', e);
  }

  // Extend Subscription Expiry Date upon paying a Plan Renewal Invoice
  let currentSub = await fetchVendorSubscription(vendorId);
  const hasPlanRenewalItem = updatedInv.items.some(i => i.category === 'plan_renewal');

  if (hasPlanRenewalItem) {
    const currentExpiry = new Date(currentSub.expiryDate);
    const baseDate = currentExpiry > new Date() ? currentExpiry : new Date();
    const newExpiry = new Date(baseDate.getTime() + currentSub.billingPeriodMonths * 30 * 24 * 60 * 60 * 1000);

    currentSub = await updateVendorSubscription(vendorId, {
      expiryDate: newExpiry.toISOString(),
      status: 'active',
      lastInvoiceId: invoiceId
    });
  }

  await logBIEvent(
    vendorId,
    'INVOICE_PAID',
    `Invoice ${updatedInv.invoiceNumber} paid via ${paymentMethod}. New expiry: ${new Date(currentSub.expiryDate).toLocaleDateString()}`,
    { invoiceId, paymentMethod, newExpiry: currentSub.expiryDate }
  );

  return { invoice: updatedInv, subscription: currentSub };
}

// ==========================================
// FINANCIAL CHART OF ACCOUNTS & CHECK WRITER
// ==========================================

const DEFAULT_COA_ACCOUNTS: Omit<ChartOfAccount, 'vendorId'>[] = [
  {
    id: 'coa_cash_drawer',
    accountCode: '1010',
    accountName: 'CASH Drawer',
    accountType: 'asset',
    category: 'Cash & Till Equivalents',
    balance: 2500.00,
    description: 'Active POS Register Cash Drawer for daily store transactions and cash floats',
    isDefault: true,
    isBankOrCash: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: 'coa_cogs_reserves',
    accountCode: '1020',
    accountName: 'COGS Reserves Account',
    accountType: 'asset',
    category: 'Protected COGS Reserve',
    balance: 18450.00,
    description: 'Protected Reserve Account collecting all COGS from sale transactions to protect capital for supplier purchases and creditor payments',
    isDefault: true,
    isCOGSReserve: true,
    isBankOrCash: true,
    bankDetails: {
      bankName: 'Enterprise Reserve Trust Bank',
      accountNumber: '**** 9912',
      routingNumber: '021000888'
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: 'coa_main_cashbook',
    accountCode: '1000',
    accountName: 'Main Cashbook',
    accountType: 'asset',
    category: 'Bank Accounts',
    balance: 48200.00,
    description: 'Primary Operating Bank Cashbook for enterprise operations and check payments',
    isDefault: true,
    isBankOrCash: true,
    bankDetails: {
      bankName: 'First National Commerce Bank',
      accountNumber: '**** 8842',
      routingNumber: '021000021'
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: 'coa_accounts_payable',
    accountCode: '2000',
    accountName: 'Accounts Payable (Creditors)',
    accountType: 'liability',
    category: 'Current Liabilities',
    balance: 6400.00,
    description: 'Outstanding liabilities owed to trade suppliers and vendor creditors',
    isDefault: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: 'coa_inventory_asset',
    accountCode: '1200',
    accountName: 'Inventory Asset',
    accountType: 'asset',
    category: 'Current Assets',
    balance: 62300.00,
    description: 'Total valuation of physical merchandise inventory across all warehouses and branches',
    isDefault: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: 'coa_sales_revenue',
    accountCode: '4000',
    accountName: 'Sales Revenue',
    accountType: 'revenue',
    category: 'Operating Income',
    balance: 128400.00,
    description: 'Gross sales income generated from POS and online order operations',
    isDefault: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: 'coa_cogs_expense',
    accountCode: '5000',
    accountName: 'Cost of Goods Sold (COGS)',
    accountType: 'expense',
    category: 'Direct Cost of Sales',
    balance: 74200.00,
    description: 'Direct cost incurred for inventory items sold to customers',
    isDefault: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: 'coa_operating_expense',
    accountCode: '6000',
    accountName: 'Operating & Administrative Expenses',
    accountType: 'expense',
    category: 'Operating Overhead',
    balance: 12300.00,
    description: 'General operational overhead including utilities, rent, and maintenance',
    isDefault: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }
];

export async function fetchChartOfAccounts(vendorId: string): Promise<ChartOfAccount[]> {
  try {
    const raw = localStorage.getItem(`${LOCAL_STORAGE_KEY}_coa_${vendorId}`);
    if (raw) {
      const parsed: ChartOfAccount[] = JSON.parse(raw);
      // Ensure default mandatory accounts CASH Drawer, COGS Reserves, Main Cashbook exist
      const hasCashDrawer = parsed.some(a => a.accountName.toLowerCase().includes('cash drawer') || a.accountCode === '1010');
      const hasCogsReserve = parsed.some(a => a.isCOGSReserve || a.accountCode === '1020');
      const hasMainCashbook = parsed.some(a => a.accountName.toLowerCase().includes('main cashbook') || a.accountCode === '1000');

      if (!hasCashDrawer || !hasCogsReserve || !hasMainCashbook) {
        const merged = [...parsed];
        if (!hasCashDrawer) merged.push({ ...DEFAULT_COA_ACCOUNTS[0], vendorId });
        if (!hasCogsReserve) merged.push({ ...DEFAULT_COA_ACCOUNTS[1], vendorId });
        if (!hasMainCashbook) merged.push({ ...DEFAULT_COA_ACCOUNTS[2], vendorId });
        localStorage.setItem(`${LOCAL_STORAGE_KEY}_coa_${vendorId}`, JSON.stringify(merged));
        return merged;
      }
      return parsed;
    }
  } catch (e) {
    console.warn('localStorage fetchChartOfAccounts error:', e);
  }

  // Seed default COA
  const seeded = DEFAULT_COA_ACCOUNTS.map(a => ({ ...a, vendorId }));
  try {
    localStorage.setItem(`${LOCAL_STORAGE_KEY}_coa_${vendorId}`, JSON.stringify(seeded));
  } catch (e) {
    console.warn('localStorage save seed COA error:', e);
  }

  return seeded;
}

export async function saveChartOfAccount(vendorId: string, accountData: Omit<ChartOfAccount, 'id' | 'vendorId' | 'createdAt' | 'updatedAt'> & { id?: string }): Promise<ChartOfAccount> {
  const accounts = await fetchChartOfAccounts(vendorId);
  const now = new Date().toISOString();

  let updatedAccount: ChartOfAccount;
  if (accountData.id) {
    const existingIndex = accounts.findIndex(a => a.id === accountData.id);
    if (existingIndex >= 0) {
      updatedAccount = {
        ...accounts[existingIndex],
        ...accountData,
        updatedAt: now
      };
      accounts[existingIndex] = updatedAccount;
    } else {
      updatedAccount = {
        ...accountData as any,
        id: accountData.id,
        vendorId,
        createdAt: now,
        updatedAt: now
      };
      accounts.push(updatedAccount);
    }
  } else {
    updatedAccount = {
      ...accountData,
      id: `coa_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
      vendorId,
      createdAt: now,
      updatedAt: now
    };
    accounts.push(updatedAccount);
  }

  localStorage.setItem(`${LOCAL_STORAGE_KEY}_coa_${vendorId}`, JSON.stringify(accounts));

  await logBIEvent(
    vendorId,
    'COA_ACCOUNT_SAVED',
    `Chart of Account ${updatedAccount.accountCode} - ${updatedAccount.accountName} saved. Type: ${updatedAccount.accountType}`,
    { accountId: updatedAccount.id, code: updatedAccount.accountCode, name: updatedAccount.accountName }
  );

  return updatedAccount;
}

export async function fetchIssuedChecks(vendorId: string): Promise<IssuedCheck[]> {
  try {
    const raw = localStorage.getItem(`${LOCAL_STORAGE_KEY}_issued_checks_${vendorId}`);
    if (raw) {
      return JSON.parse(raw);
    }
  } catch (e) {
    console.warn('localStorage fetchIssuedChecks error:', e);
  }

  // Seed initial sample check for demonstration
  const seededChecks: IssuedCheck[] = [
    {
      id: 'chk_1001',
      vendorId,
      checkNumber: 'CHK-1001',
      sourceAccountId: 'coa_main_cashbook',
      sourceAccountName: 'Main Cashbook - First National Commerce Bank',
      payeeName: 'Global Wholesale Suppliers Ltd',
      amount: 4250.00,
      amountInWords: 'Four Thousand Two Hundred Fifty Dollars and 00/100',
      date: new Date(Date.now() - 86400000 * 2).toISOString().split('T')[0],
      memo: 'Purchase Order #PO-8842 Inventory Stock Restock',
      categoryAccountId: 'coa_accounts_payable',
      categoryAccountName: 'Accounts Payable (Creditors)',
      authorizedBy: 'Chief Financial Controller',
      status: 'cleared',
      createdAt: new Date(Date.now() - 86400000 * 2).toISOString()
    },
    {
      id: 'chk_1002',
      vendorId,
      checkNumber: 'CHK-1002',
      sourceAccountId: 'coa_cogs_reserves',
      sourceAccountName: 'COGS Reserves Account',
      payeeName: 'Apex Distributing Co',
      amount: 1850.00,
      amountInWords: 'One Thousand Eight Hundred Fifty Dollars and 00/100',
      date: new Date().toISOString().split('T')[0],
      memo: 'Protected COGS Reserve Disbursement for Supplier Invoice #INV-9021',
      categoryAccountId: 'coa_accounts_payable',
      categoryAccountName: 'Accounts Payable (Creditors)',
      authorizedBy: 'Finance Director',
      status: 'issued',
      createdAt: new Date().toISOString()
    }
  ];

  try {
    localStorage.setItem(`${LOCAL_STORAGE_KEY}_issued_checks_${vendorId}`, JSON.stringify(seededChecks));
  } catch (e) {
    console.warn('localStorage seed checks error:', e);
  }

  return seededChecks;
}

export async function createIssuedCheck(
  vendorId: string, 
  checkData: Omit<IssuedCheck, 'id' | 'createdAt'>
): Promise<IssuedCheck> {
  const checks = await fetchIssuedChecks(vendorId);
  const now = new Date().toISOString();

  const newCheck: IssuedCheck = {
    ...checkData,
    id: `chk_${Date.now()}`,
    createdAt: now
  };

  checks.unshift(newCheck);
  localStorage.setItem(`${LOCAL_STORAGE_KEY}_issued_checks_${vendorId}`, JSON.stringify(checks));

  // Automatically update balance of source cash/bank account in COA
  const accounts = await fetchChartOfAccounts(vendorId);
  const sourceAccIndex = accounts.findIndex(a => a.id === checkData.sourceAccountId);
  if (sourceAccIndex >= 0) {
    accounts[sourceAccIndex].balance -= checkData.amount;
    accounts[sourceAccIndex].updatedAt = now;
    localStorage.setItem(`${LOCAL_STORAGE_KEY}_coa_${vendorId}`, JSON.stringify(accounts));
  }

  await logBIEvent(
    vendorId,
    'CHECK_ISSUED',
    `Issued Check ${newCheck.checkNumber} for $${newCheck.amount.toFixed(2)} to ${newCheck.payeeName} from ${newCheck.sourceAccountName}`,
    { checkId: newCheck.id, checkNumber: newCheck.checkNumber, amount: newCheck.amount, payee: newCheck.payeeName }
  );

  return newCheck;
}

export async function updateCheckStatus(
  vendorId: string,
  checkId: string,
  newStatus: 'issued' | 'cleared' | 'voided'
): Promise<void> {
  const checks = await fetchIssuedChecks(vendorId);
  const checkIndex = checks.findIndex(c => c.id === checkId);
  if (checkIndex < 0) return;

  const targetCheck = checks[checkIndex];
  const oldStatus = targetCheck.status;
  targetCheck.status = newStatus;
  checks[checkIndex] = targetCheck;

  localStorage.setItem(`${LOCAL_STORAGE_KEY}_issued_checks_${vendorId}`, JSON.stringify(checks));

  // If check was voided and was previously issued/cleared, refund balance back to source account
  if (newStatus === 'voided' && oldStatus !== 'voided') {
    const accounts = await fetchChartOfAccounts(vendorId);
    const sourceAccIndex = accounts.findIndex(a => a.id === targetCheck.sourceAccountId);
    if (sourceAccIndex >= 0) {
      accounts[sourceAccIndex].balance += targetCheck.amount;
      accounts[sourceAccIndex].updatedAt = new Date().toISOString();
      localStorage.setItem(`${LOCAL_STORAGE_KEY}_coa_${vendorId}`, JSON.stringify(accounts));
    }
  }

  await logBIEvent(
    vendorId,
    'CHECK_STATUS_UPDATED',
    `Check ${targetCheck.checkNumber} status updated to ${newStatus}`,
    { checkId, newStatus }
  );
}

// ==========================================
// CUSTOMERS & CREDIT SALES & COLLECTIONS ENGINE
// ==========================================

const DEFAULT_CUSTOMERS: Omit<Customer, 'vendorId'>[] = [
  {
    id: 'cust_101',
    customerCode: 'CUST-1001',
    name: 'Metro Supermarket Chain',
    phone: '+1 (555) 234-5678',
    email: 'billing@metrosupermarkets.com',
    address: '100 Metro Plaza, Financial District, Suite 400',
    creditLimit: 30000.00,
    currentBalance: 12450.00,
    creditTermsDays: 30,
    riskCategory: 'low',
    status: 'active',
    notes: 'Key Tier-1 Enterprise Wholesale Customer - Monthly Billing Cycle',
    createdAt: new Date(Date.now() - 86400000 * 180).toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: 'cust_102',
    customerCode: 'CUST-1002',
    name: 'Apex Wholesalers & Distributors Ltd',
    phone: '+1 (555) 876-5432',
    email: 'accounts@apexwholesalers.io',
    address: '88 Logistics Blvd, Port Industrial Zone',
    creditLimit: 20000.00,
    currentBalance: 8900.00,
    creditTermsDays: 15,
    riskCategory: 'medium',
    status: 'active',
    notes: 'Strict 15-day payment term agreement',
    createdAt: new Date(Date.now() - 86400000 * 120).toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: 'cust_103',
    customerCode: 'CUST-1003',
    name: 'QuickMart Convenience Outlets',
    phone: '+1 (555) 345-6789',
    email: 'finance@quickmart.com',
    address: '42 Main Street, Midtown',
    creditLimit: 10000.00,
    currentBalance: 9800.00,
    creditTermsDays: 30,
    riskCategory: 'high',
    status: 'active',
    notes: 'Near credit limit - requires active collection monitoring',
    createdAt: new Date(Date.now() - 86400000 * 90).toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: 'cust_104',
    customerCode: 'CUST-1004',
    name: 'City Corner Bistro & Groceries',
    phone: '+1 (555) 901-2345',
    email: 'orders@citycornerbistro.com',
    address: '12 West Avenue, Downtown',
    creditLimit: 5000.00,
    currentBalance: 1200.00,
    creditTermsDays: 14,
    riskCategory: 'low',
    status: 'active',
    notes: 'Reliable weekly buyer with prompt pay history',
    createdAt: new Date(Date.now() - 86400000 * 60).toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: 'cust_105',
    customerCode: 'CUST-1005',
    name: 'Horizon Hotel & Resort Group',
    phone: '+1 (555) 654-3210',
    email: 'purchasing@horizonresorts.com',
    address: '77 Ocean Drive, Resort District',
    creditLimit: 50000.00,
    currentBalance: 18500.00,
    creditTermsDays: 45,
    riskCategory: 'medium',
    status: 'active',
    notes: 'Corporate hospitality contract with 45-day payment terms',
    createdAt: new Date(Date.now() - 86400000 * 200).toISOString(),
    updatedAt: new Date().toISOString()
  }
];

export async function fetchCustomers(vendorId: string): Promise<Customer[]> {
  try {
    const raw = localStorage.getItem(`${LOCAL_STORAGE_KEY}_customers_${vendorId}`);
    if (raw) {
      return JSON.parse(raw);
    }
  } catch (e) {
    console.warn('localStorage fetchCustomers error:', e);
  }

  const seeded = DEFAULT_CUSTOMERS.map(c => ({ ...c, vendorId }));
  try {
    localStorage.setItem(`${LOCAL_STORAGE_KEY}_customers_${vendorId}`, JSON.stringify(seeded));
  } catch (e) {
    console.warn('localStorage seed customers error:', e);
  }
  return seeded;
}

export async function saveCustomer(
  vendorId: string, 
  customerData: Omit<Customer, 'id' | 'vendorId' | 'createdAt' | 'updatedAt' | 'currentBalance'> & { id?: string; currentBalance?: number }
): Promise<Customer> {
  const customers = await fetchCustomers(vendorId);
  const now = new Date().toISOString();

  let updatedCust: Customer;
  if (customerData.id) {
    const idx = customers.findIndex(c => c.id === customerData.id);
    if (idx >= 0) {
      updatedCust = {
        ...customers[idx],
        ...customerData,
        updatedAt: now
      };
      customers[idx] = updatedCust;
    } else {
      updatedCust = {
        ...customerData as any,
        id: customerData.id,
        vendorId,
        currentBalance: customerData.currentBalance || 0,
        createdAt: now,
        updatedAt: now
      };
      customers.push(updatedCust);
    }
  } else {
    const nextCode = `CUST-${1000 + customers.length + 1}`;
    updatedCust = {
      ...customerData,
      id: `cust_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
      vendorId,
      customerCode: customerData.customerCode || nextCode,
      currentBalance: customerData.currentBalance || 0,
      createdAt: now,
      updatedAt: now
    };
    customers.push(updatedCust);
  }

  localStorage.setItem(`${LOCAL_STORAGE_KEY}_customers_${vendorId}`, JSON.stringify(customers));

  await logBIEvent(
    vendorId,
    customerData.id ? 'CUSTOMER_UPDATED' : 'CUSTOMER_CREATED',
    `Customer ${updatedCust.customerCode} (${updatedCust.name}) saved with credit limit $${updatedCust.creditLimit.toFixed(2)}`,
    { customerId: updatedCust.id, code: updatedCust.customerCode, name: updatedCust.name }
  );

  return updatedCust;
}

export async function fetchCreditSales(vendorId: string): Promise<CreditSale[]> {
  try {
    const raw = localStorage.getItem(`${LOCAL_STORAGE_KEY}_credit_sales_${vendorId}`);
    if (raw) {
      return JSON.parse(raw);
    }
  } catch (e) {
    console.warn('localStorage fetchCreditSales error:', e);
  }

  const nowMs = Date.now();
  const dayMs = 86400000;

  // Seeded credit invoices spanning 0-30 days, 31-60 days, 61-90 days, 90+ days
  const seededSales: CreditSale[] = [
    // 0 - 30 days old (Current)
    {
      id: 'cs_1001',
      vendorId,
      invoiceNumber: 'INV-CR-2001',
      customerId: 'cust_101',
      customerName: 'Metro Supermarket Chain',
      customerCode: 'CUST-1001',
      saleDate: new Date(nowMs - dayMs * 10).toISOString().split('T')[0],
      dueDate: new Date(nowMs + dayMs * 20).toISOString().split('T')[0],
      totalAmount: 6450.00,
      paidAmount: 2000.00,
      balanceAmount: 4450.00,
      status: 'partially_paid',
      items: [
        { productId: 'p1', productName: 'Organic Whole Milk 1L', quantity: 500, unitPrice: 3.50, totalPrice: 1750.00 },
        { productId: 'p2', productName: 'Artisanal Whole Wheat Bread 500g', quantity: 1000, unitPrice: 4.70, totalPrice: 4700.00 }
      ],
      notes: 'Bulk retail consignment delivery',
      createdAt: new Date(nowMs - dayMs * 10).toISOString(),
      updatedAt: new Date(nowMs - dayMs * 10).toISOString()
    },
    // 31 - 60 days old (Slightly Overdue)
    {
      id: 'cs_1002',
      vendorId,
      invoiceNumber: 'INV-CR-2002',
      customerId: 'cust_101',
      customerName: 'Metro Supermarket Chain',
      customerCode: 'CUST-1001',
      saleDate: new Date(nowMs - dayMs * 45).toISOString().split('T')[0],
      dueDate: new Date(nowMs - dayMs * 15).toISOString().split('T')[0],
      totalAmount: 8000.00,
      paidAmount: 0.00,
      balanceAmount: 8000.00,
      status: 'overdue',
      items: [
        { productId: 'p3', productName: 'Extra Virgin Olive Oil 750ml', quantity: 400, unitPrice: 20.00, totalPrice: 8000.00 }
      ],
      notes: 'Consignment order #8812 - Payment reminder sent',
      createdAt: new Date(nowMs - dayMs * 45).toISOString(),
      updatedAt: new Date(nowMs - dayMs * 45).toISOString()
    },
    // 31 - 60 days old (Apex Wholesalers)
    {
      id: 'cs_1003',
      vendorId,
      invoiceNumber: 'INV-CR-2003',
      customerId: 'cust_102',
      customerName: 'Apex Wholesalers & Distributors Ltd',
      customerCode: 'CUST-1002',
      saleDate: new Date(nowMs - dayMs * 50).toISOString().split('T')[0],
      dueDate: new Date(nowMs - dayMs * 35).toISOString().split('T')[0],
      totalAmount: 8900.00,
      paidAmount: 0.00,
      balanceAmount: 8900.00,
      status: 'overdue',
      items: [
        { productId: 'p4', productName: 'Premium Ground Coffee 1kg', quantity: 356, unitPrice: 25.00, totalPrice: 8900.00 }
      ],
      notes: '15-day credit terms breached. Collections active.',
      createdAt: new Date(nowMs - dayMs * 50).toISOString(),
      updatedAt: new Date(nowMs - dayMs * 50).toISOString()
    },
    // 61 - 90 days old (QuickMart)
    {
      id: 'cs_1004',
      vendorId,
      invoiceNumber: 'INV-CR-2004',
      customerId: 'cust_103',
      customerName: 'QuickMart Convenience Outlets',
      customerCode: 'CUST-1003',
      saleDate: new Date(nowMs - dayMs * 75).toISOString().split('T')[0],
      dueDate: new Date(nowMs - dayMs * 45).toISOString().split('T')[0],
      totalAmount: 5800.00,
      paidAmount: 0.00,
      balanceAmount: 5800.00,
      status: 'overdue',
      items: [
        { productId: 'p5', productName: 'Energy Drink 250ml (Pack of 24)', quantity: 200, unitPrice: 29.00, totalPrice: 5800.00 }
      ],
      notes: 'High risk delinquent balance - Demand letter issued',
      createdAt: new Date(nowMs - dayMs * 75).toISOString(),
      updatedAt: new Date(nowMs - dayMs * 75).toISOString()
    },
    // 90+ days old (QuickMart & Horizon Resorts)
    {
      id: 'cs_1005',
      vendorId,
      invoiceNumber: 'INV-CR-2005',
      customerId: 'cust_103',
      customerName: 'QuickMart Convenience Outlets',
      customerCode: 'CUST-1003',
      saleDate: new Date(nowMs - dayMs * 110).toISOString().split('T')[0],
      dueDate: new Date(nowMs - dayMs * 80).toISOString().split('T')[0],
      totalAmount: 4000.00,
      paidAmount: 0.00,
      balanceAmount: 4000.00,
      status: 'overdue',
      items: [
        { productId: 'p6', productName: 'Confectionery Snack Trays', quantity: 200, unitPrice: 20.00, totalPrice: 4000.00 }
      ],
      notes: 'Over 90 days aged - Legal collection warning',
      createdAt: new Date(nowMs - dayMs * 110).toISOString(),
      updatedAt: new Date(nowMs - dayMs * 110).toISOString()
    },
    // Horizon Hotel (0-30 days current)
    {
      id: 'cs_1006',
      vendorId,
      invoiceNumber: 'INV-CR-2006',
      customerId: 'cust_105',
      customerName: 'Horizon Hotel & Resort Group',
      customerCode: 'CUST-1005',
      saleDate: new Date(nowMs - dayMs * 15).toISOString().split('T')[0],
      dueDate: new Date(nowMs + dayMs * 30).toISOString().split('T')[0],
      totalAmount: 18500.00,
      paidAmount: 0.00,
      balanceAmount: 18500.00,
      status: 'unpaid',
      items: [
        { productId: 'p7', productName: 'Hospitality Beverage Supply Bundle', quantity: 50, unitPrice: 370.00, totalPrice: 18500.00 }
      ],
      notes: '45-Day Corporate Net Terms - Current in terms',
      createdAt: new Date(nowMs - dayMs * 15).toISOString(),
      updatedAt: new Date(nowMs - dayMs * 15).toISOString()
    },
    // City Corner Bistro (0-30 days current)
    {
      id: 'cs_1007',
      vendorId,
      invoiceNumber: 'INV-CR-2007',
      customerId: 'cust_104',
      customerName: 'City Corner Bistro & Groceries',
      customerCode: 'CUST-1004',
      saleDate: new Date(nowMs - dayMs * 5).toISOString().split('T')[0],
      dueDate: new Date(nowMs + dayMs * 9).toISOString().split('T')[0],
      totalAmount: 1200.00,
      paidAmount: 0.00,
      balanceAmount: 1200.00,
      status: 'unpaid',
      items: [
        { productId: 'p8', productName: 'Fresh Dairy & Produce Delivery', quantity: 20, unitPrice: 60.00, totalPrice: 1200.00 }
      ],
      notes: 'Weekly fresh stock delivery',
      createdAt: new Date(nowMs - dayMs * 5).toISOString(),
      updatedAt: new Date(nowMs - dayMs * 5).toISOString()
    }
  ];

  try {
    localStorage.setItem(`${LOCAL_STORAGE_KEY}_credit_sales_${vendorId}`, JSON.stringify(seededSales));
  } catch (e) {
    console.warn('localStorage seed credit sales error:', e);
  }

  return seededSales;
}

export async function createCreditSale(
  vendorId: string, 
  saleData: Omit<CreditSale, 'id' | 'vendorId' | 'paidAmount' | 'balanceAmount' | 'status' | 'createdAt' | 'updatedAt'>
): Promise<CreditSale> {
  const sales = await fetchCreditSales(vendorId);
  const customers = await fetchCustomers(vendorId);
  const now = new Date().toISOString();

  const newSale: CreditSale = {
    ...saleData,
    id: `cs_${Date.now()}`,
    vendorId,
    paidAmount: 0,
    balanceAmount: saleData.totalAmount,
    status: 'unpaid',
    createdAt: now,
    updatedAt: now
  };

  sales.unshift(newSale);
  localStorage.setItem(`${LOCAL_STORAGE_KEY}_credit_sales_${vendorId}`, JSON.stringify(sales));

  // Increase customer's current balance
  const custIndex = customers.findIndex(c => c.id === saleData.customerId);
  if (custIndex >= 0) {
    customers[custIndex].currentBalance += saleData.totalAmount;
    customers[custIndex].updatedAt = now;
    localStorage.setItem(`${LOCAL_STORAGE_KEY}_customers_${vendorId}`, JSON.stringify(customers));
  }

  await logBIEvent(
    vendorId,
    'CREDIT_SALE_CREATED',
    `Credit Sale Invoice ${newSale.invoiceNumber} for $${newSale.totalAmount.toFixed(2)} issued to ${newSale.customerName}`,
    { invoiceNumber: newSale.invoiceNumber, customerId: newSale.customerId, amount: newSale.totalAmount }
  );

  return newSale;
}

export async function fetchCreditPayments(vendorId: string): Promise<CreditPayment[]> {
  try {
    const raw = localStorage.getItem(`${LOCAL_STORAGE_KEY}_credit_payments_${vendorId}`);
    if (raw) {
      return JSON.parse(raw);
    }
  } catch (e) {
    console.warn('localStorage fetchCreditPayments error:', e);
  }

  // Seed sample initial payment
  const seededPayments: CreditPayment[] = [
    {
      id: 'cp_1001',
      vendorId,
      creditSaleId: 'cs_1001',
      invoiceNumber: 'INV-CR-2001',
      customerId: 'cust_101',
      customerName: 'Metro Supermarket Chain',
      amount: 2000.00,
      paymentMethod: 'bank_transfer',
      referenceNo: 'WIRE-8849120',
      paymentDate: new Date(Date.now() - 86400000 * 5).toISOString().split('T')[0],
      recordedBy: 'Accounts Receivable Officer',
      notes: 'Partial payment wire transfer received into Main Cashbook',
      createdAt: new Date(Date.now() - 86400000 * 5).toISOString()
    }
  ];

  try {
    localStorage.setItem(`${LOCAL_STORAGE_KEY}_credit_payments_${vendorId}`, JSON.stringify(seededPayments));
  } catch (e) {
    console.warn('localStorage seed credit payments error:', e);
  }

  return seededPayments;
}

export async function recordCreditPayment(
  vendorId: string, 
  paymentData: Omit<CreditPayment, 'id' | 'vendorId' | 'createdAt'>
): Promise<CreditPayment> {
  const payments = await fetchCreditPayments(vendorId);
  const sales = await fetchCreditSales(vendorId);
  const customers = await fetchCustomers(vendorId);
  const coaList = await fetchChartOfAccounts(vendorId);
  const now = new Date().toISOString();

  const newPayment: CreditPayment = {
    ...paymentData,
    id: `cp_${Date.now()}`,
    vendorId,
    createdAt: now
  };

  payments.unshift(newPayment);
  localStorage.setItem(`${LOCAL_STORAGE_KEY}_credit_payments_${vendorId}`, JSON.stringify(payments));

  // 1. Update Credit Sale Invoice Balance & Status
  const saleIndex = sales.findIndex(s => s.id === paymentData.creditSaleId);
  if (saleIndex >= 0) {
    const sale = sales[saleIndex];
    sale.paidAmount += paymentData.amount;
    sale.balanceAmount = Math.max(0, sale.totalAmount - sale.paidAmount);
    if (sale.balanceAmount <= 0) {
      sale.status = 'paid';
    } else {
      sale.status = 'partially_paid';
    }
    sale.updatedAt = now;
    sales[saleIndex] = sale;
    localStorage.setItem(`${LOCAL_STORAGE_KEY}_credit_sales_${vendorId}`, JSON.stringify(sales));
  }

  // 2. Reduce Customer Outstanding Balance
  const custIndex = customers.findIndex(c => c.id === paymentData.customerId);
  if (custIndex >= 0) {
    customers[custIndex].currentBalance = Math.max(0, customers[custIndex].currentBalance - paymentData.amount);
    customers[custIndex].updatedAt = now;
    localStorage.setItem(`${LOCAL_STORAGE_KEY}_customers_${vendorId}`, JSON.stringify(customers));
  }

  // 3. Post Cash Entry to Main Cashbook or Cash Drawer in Chart of Accounts
  const targetAcc = coaList.find(a => a.accountName.toLowerCase().includes('main cashbook')) || coaList.find(a => a.isBankOrCash);
  if (targetAcc) {
    targetAcc.balance += paymentData.amount;
    targetAcc.updatedAt = now;
    localStorage.setItem(`${LOCAL_STORAGE_KEY}_coa_${vendorId}`, JSON.stringify(coaList));
  }

  await logBIEvent(
    vendorId,
    'CREDIT_PAYMENT_RECORDED',
    `Collection Payment of $${paymentData.amount.toFixed(2)} received for invoice ${paymentData.invoiceNumber} from ${paymentData.customerName}`,
    { invoiceNumber: paymentData.invoiceNumber, customerId: paymentData.customerId, amount: paymentData.amount }
  );

  return newPayment;
}

export async function fetchCollectionActivities(vendorId: string): Promise<CollectionActivity[]> {
  try {
    const raw = localStorage.getItem(`${LOCAL_STORAGE_KEY}_collections_${vendorId}`);
    if (raw) {
      return JSON.parse(raw);
    }
  } catch (e) {
    console.warn('localStorage fetchCollectionActivities error:', e);
  }

  const seededActivities: CollectionActivity[] = [
    {
      id: 'ca_1001',
      vendorId,
      customerId: 'cust_102',
      customerName: 'Apex Wholesalers & Distributors Ltd',
      activityType: 'phone_call',
      notes: 'Spoke with CFO Mr. David Vance. Promised wire transfer of $8,900 by next Tuesday.',
      promisedDate: new Date(Date.now() + 86400000 * 4).toISOString().split('T')[0],
      promisedAmount: 8900.00,
      status: 'logged',
      loggedBy: 'Chief Credit Controller',
      createdAt: new Date(Date.now() - 86400000 * 2).toISOString()
    },
    {
      id: 'ca_1002',
      vendorId,
      customerId: 'cust_103',
      customerName: 'QuickMart Convenience Outlets',
      activityType: 'demand_letter',
      notes: 'Final formal legal notice sent for invoices INV-CR-2004 & INV-CR-2005 ($9,800 total).',
      status: 'escalated',
      loggedBy: 'Legal & Risk Director',
      createdAt: new Date(Date.now() - 86400000 * 7).toISOString()
    }
  ];

  try {
    localStorage.setItem(`${LOCAL_STORAGE_KEY}_collections_${vendorId}`, JSON.stringify(seededActivities));
  } catch (e) {
    console.warn('localStorage seed collection activities error:', e);
  }

  return seededActivities;
}

export async function logCollectionActivity(
  vendorId: string, 
  activityData: Omit<CollectionActivity, 'id' | 'vendorId' | 'createdAt'>
): Promise<CollectionActivity> {
  const activities = await fetchCollectionActivities(vendorId);
  const now = new Date().toISOString();

  const newActivity: CollectionActivity = {
    ...activityData,
    id: `ca_${Date.now()}`,
    vendorId,
    createdAt: now
  };

  activities.unshift(newActivity);
  localStorage.setItem(`${LOCAL_STORAGE_KEY}_collections_${vendorId}`, JSON.stringify(activities));

  await logBIEvent(
    vendorId,
    'COLLECTION_ACTIVITY_LOGGED',
    `Collection Activity (${activityData.activityType}) logged for ${activityData.customerName}`,
    { customerId: activityData.customerId, activityType: activityData.activityType }
  );

  return newActivity;
}
