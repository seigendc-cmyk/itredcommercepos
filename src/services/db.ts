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
  onSnapshot
} from 'firebase/firestore';
import { db } from '../lib/firebase';
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
  CollectionActivity
} from '../types';
import { logBIEvent } from '../bi/tracker';

// Helper for local caching/fallback to ensure snappy preview & offline resiliency
const LOCAL_STORAGE_KEY = 'itred_pos_vendor_data_';

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
export async function fetchVendorProfile(vendorId: string, userEmail?: string): Promise<VendorProfile | null> {
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

  // Auto-provision returning demo vendor profile if accessing seigendc@gmail.com
  if (userEmail === 'seigendc@gmail.com' || vendorId.includes('c2VpZ2VuZGNAZ21haWwuY29t')) {
    const onboarded = await onboardVendor(vendorId, 'seigendc@gmail.com', {
      businessName: 'iTred Retail HQ',
      address: '742 Evergreen Terrace, Commerce Hub',
      phone: '+1 (555) 019-2831'
    });
    return onboarded.profile;
  }

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
    status: 'active',
    createdAt: now,
  };

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
      createdAt: new Date().toISOString()
    }
  ];
}

// Add New Branch
export async function createBranch(vendorId: string, name: string, address: string, phone: string): Promise<Branch> {
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
    createdAt: now,
  };

  try {
    await setDoc(doc(db, 'vendors', vendorId, 'branches', id), newBranch);
  } catch (e) {
    console.warn(e);
  }

  // Update local
  const current = await fetchBranches(vendorId);
  const updated = [...current, newBranch];
  localStorage.setItem(`${LOCAL_STORAGE_KEY}_br_${vendorId}`, JSON.stringify(updated));

  // Also create a default terminal for this new branch
  await createTerminal(vendorId, id, `${name} POS 1`);

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
      status: 'active',
      createdAt: new Date().toISOString()
    }
  ];
  return branchId ? list.filter(t => t.branchId === branchId) : list;
}

// Add New Terminal
export async function createTerminal(vendorId: string, branchId: string, name: string): Promise<Terminal> {
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
    status: 'active',
    createdAt: now,
  };

  try {
    await setDoc(doc(db, 'vendors', vendorId, 'terminals', id), newTerm);
  } catch (e) {
    console.warn(e);
  }

  const current = await fetchTerminals(vendorId);
  localStorage.setItem(`${LOCAL_STORAGE_KEY}_term_${vendorId}`, JSON.stringify([...current, newTerm]));

  return newTerm;
}

// Fetch Products
export async function fetchProducts(vendorId: string): Promise<Product[]> {
  try {
    const colRef = collection(db, 'vendors', vendorId, 'products');
    const snap = await getDocs(colRef);
    if (!snap.empty) {
      return snap.docs.map(d => d.data() as Product);
    }
  } catch (e) {
    console.warn(e);
  }
  const raw = localStorage.getItem(`${LOCAL_STORAGE_KEY}_products_${vendorId}`);
  if (raw) return JSON.parse(raw);
  
  // Return default starter list
  const now = new Date().toISOString();
  const initial = STARTER_PRODUCTS.map((p, idx) => ({
    ...p,
    id: `prod_default_${idx}`,
    vendorId,
    createdAt: now,
  }));
  localStorage.setItem(`${LOCAL_STORAGE_KEY}_products_${vendorId}`, JSON.stringify(initial));
  return initial;
}

// Save or Update Product
export async function saveProduct(vendorId: string, product: Partial<Product>): Promise<Product> {
  const now = new Date().toISOString();
  const id = product.id || `prod_${Math.random().toString(36).substring(2, 9)}`;
  const fullProduct: Product = {
    id,
    vendorId,
    sku: product.sku || `SKU-${Math.floor(1000 + Math.random() * 9000)}`,
    name: product.name || 'Untitled Product',
    category: product.category || 'General',
    description: product.description || '',
    costPrice: Number(product.costPrice) || 0,
    sellingPrice: Number(product.sellingPrice) || 0,
    barcode: product.barcode || String(Math.floor(1000000000 + Math.random() * 9000000000)),
    unit: product.unit || 'pcs',
    reorderLevel: Number(product.reorderLevel) || 10,
    createdAt: product.createdAt || now,
  };

  try {
    await setDoc(doc(db, 'vendors', vendorId, 'products', id), fullProduct);
  } catch (e) {
    console.warn(e);
  }

  const current = await fetchProducts(vendorId);
  const idx = current.findIndex(p => p.id === id);
  let updated: Product[];
  if (idx >= 0) {
    updated = [...current];
    updated[idx] = fullProduct;
  } else {
    updated = [fullProduct, ...current];
  }
  localStorage.setItem(`${LOCAL_STORAGE_KEY}_products_${vendorId}`, JSON.stringify(updated));

  return fullProduct;
}

// Bulk Import Products & Stock Adjustments
export async function bulkImportProducts(
  vendorId: string,
  warehouseId: string,
  newProducts: Partial<Product>[],
  stockUpdates: { productId: string; addWarehouseQty: number }[]
): Promise<{ createdProducts: Product[] }> {
  const now = new Date().toISOString();
  const createdProducts: Product[] = [];
  const currentProducts = await fetchProducts(vendorId);
  const updatedProductsList = [...currentProducts];

  for (const item of newProducts) {
    const id = item.id || `prod_${Math.random().toString(36).substring(2, 9)}`;
    const fullProd: Product = {
      id,
      vendorId,
      sku: item.sku || `SKU-${Math.floor(1000 + Math.random() * 9000)}`,
      name: item.name || 'Imported Product',
      category: item.category || 'General',
      description: item.description || '',
      costPrice: Number(item.costPrice) || 0,
      sellingPrice: Number(item.sellingPrice) || 0,
      barcode: item.barcode || String(Math.floor(1000000000 + Math.random() * 9000000000)),
      unit: item.unit || 'pcs',
      location: item.location || 'Central Warehouse',
      shelf: item.shelf || 'Shelf 01',
      reorderLevel: Number(item.reorderLevel) || 5,
      createdAt: now,
    };

    try {
      await setDoc(doc(db, 'vendors', vendorId, 'products', id), fullProd);
    } catch (e) {
      console.warn('Firestore bulk import save warning:', e);
    }

    createdProducts.push(fullProd);
    updatedProductsList.unshift(fullProd);

    // If stockUpdate uses temporary SKU/id mapping, match it
    const matchingStock = stockUpdates.find(s => s.productId === item.sku || s.productId === item.id);
    if (matchingStock) {
      matchingStock.productId = id; // replace with real generated product ID
    }
  }

  localStorage.setItem(`${LOCAL_STORAGE_KEY}_products_${vendorId}`, JSON.stringify(updatedProductsList));

  // Update Warehouse Inventory Stock
  if (stockUpdates.length > 0 && warehouseId) {
    const currentWhStock = await fetchWarehouseStock(vendorId, warehouseId);
    for (const update of stockUpdates) {
      if (update.addWarehouseQty > 0) {
        const prev = currentWhStock[update.productId] || 0;
        currentWhStock[update.productId] = prev + update.addWarehouseQty;

        const invId = `${vendorId}_${warehouseId}_${update.productId}`;
        const invData: WarehouseInventory = {
          id: invId,
          vendorId,
          warehouseId,
          productId: update.productId,
          quantity: currentWhStock[update.productId],
          lastUpdated: now,
        };
        try {
          await setDoc(doc(db, 'vendors', vendorId, 'warehouse_inventory', invId), invData);
        } catch (e) {
          console.warn('Firestore inventory stock update warning:', e);
        }
      }
    }
    localStorage.setItem(`${LOCAL_STORAGE_KEY}_wh_stock_${vendorId}_${warehouseId}`, JSON.stringify(currentWhStock));
  }

  return { createdProducts };
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
  supplierName: string,
  referenceNo: string,
  items: { productId: string; productName: string; quantity: number; unitCost: number }[],
  notes?: string
): Promise<SupplierReceipt> {
  const now = new Date().toISOString();
  const receiptId = `rec_${Math.random().toString(36).substring(2, 9)}`;
  const totalAmount = items.reduce((sum, item) => sum + (item.quantity * item.unitCost), 0);

  const receipt: SupplierReceipt = {
    id: receiptId,
    vendorId,
    warehouseId,
    supplierName,
    referenceNo,
    date: now,
    items: items.map(i => ({ ...i, totalCost: i.quantity * i.unitCost })),
    totalAmount,
    notes,
    createdBy: 'Vendor Admin',
    createdAt: now,
  };

  // Update Warehouse Inventory
  const currentWhStock = await fetchWarehouseStock(vendorId, warehouseId);
  items.forEach(item => {
    const prev = currentWhStock[item.productId] || 0;
    currentWhStock[item.productId] = prev + item.quantity;
  });

  // Save Firestore
  try {
    await setDoc(doc(db, 'vendors', vendorId, 'supplier_receipts', receiptId), receipt);
    for (const item of items) {
      const invId = `${vendorId}_${warehouseId}_${item.productId}`;
      const invData: WarehouseInventory = {
        id: invId,
        vendorId,
        warehouseId,
        productId: item.productId,
        quantity: currentWhStock[item.productId],
        lastUpdated: now,
      };
      await setDoc(doc(db, 'vendors', vendorId, 'warehouse_inventory', invId), invData);
    }
  } catch (e) {
    console.warn('Firestore receive stock error', e);
  }

  // Save local
  localStorage.setItem(`${LOCAL_STORAGE_KEY}_wh_stock_${vendorId}_${warehouseId}`, JSON.stringify(currentWhStock));
  const existingReceiptsRaw = localStorage.getItem(`${LOCAL_STORAGE_KEY}_receipts_${vendorId}`);
  const existingReceipts = existingReceiptsRaw ? JSON.parse(existingReceiptsRaw) : [];
  localStorage.setItem(`${LOCAL_STORAGE_KEY}_receipts_${vendorId}`, JSON.stringify([receipt, ...existingReceipts]));

  return receipt;
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
  items: { productId: string; productName: string; quantity: number }[],
  notes?: string
): Promise<StockTransfer> {
  const now = new Date().toISOString();
  const transferId = `trf_${Math.random().toString(36).substring(2, 9)}`;

  // Update Warehouse stock (decrement) & Branch stock (increment)
  const whStock = await fetchWarehouseStock(vendorId, warehouseId);
  const brStock = await fetchBranchStock(vendorId, targetBranchId);

  items.forEach(item => {
    const whPrev = whStock[item.productId] || 0;
    whStock[item.productId] = Math.max(0, whPrev - item.quantity);

    const brPrev = brStock[item.productId] || 0;
    brStock[item.productId] = brPrev + item.quantity;
  });

  const transfer: StockTransfer = {
    id: transferId,
    vendorId,
    transferNo: `TRF-${Math.floor(1000 + Math.random() * 9000)}`,
    sourceWarehouseId: warehouseId,
    sourceWarehouseName: warehouseName,
    targetBranchId,
    targetBranchName,
    date: now,
    items,
    status: 'completed',
    notes,
    createdAt: now,
  };

  try {
    await setDoc(doc(db, 'vendors', vendorId, 'transfers', transferId), transfer);
    for (const item of items) {
      // Update wh inv
      const whInvId = `${vendorId}_${warehouseId}_${item.productId}`;
      await setDoc(doc(db, 'vendors', vendorId, 'warehouse_inventory', whInvId), {
        id: whInvId,
        vendorId,
        warehouseId,
        productId: item.productId,
        quantity: whStock[item.productId],
        lastUpdated: now
      });

      // Update br inv
      const brInvId = `${vendorId}_${targetBranchId}_${item.productId}`;
      await setDoc(doc(db, 'vendors', vendorId, 'branch_inventory', brInvId), {
        id: brInvId,
        vendorId,
        branchId: targetBranchId,
        productId: item.productId,
        quantity: brStock[item.productId],
        lastUpdated: now
      });
    }
  } catch (e) {
    console.warn('Firestore transfer stock error', e);
  }

  localStorage.setItem(`${LOCAL_STORAGE_KEY}_wh_stock_${vendorId}_${warehouseId}`, JSON.stringify(whStock));
  localStorage.setItem(`${LOCAL_STORAGE_KEY}_br_stock_${vendorId}_${targetBranchId}`, JSON.stringify(brStock));
  
  const existingTrfRaw = localStorage.getItem(`${LOCAL_STORAGE_KEY}_transfers_${vendorId}`);
  const existingTrf = existingTrfRaw ? JSON.parse(existingTrfRaw) : [];
  localStorage.setItem(`${LOCAL_STORAGE_KEY}_transfers_${vendorId}`, JSON.stringify([transfer, ...existingTrf]));

  return transfer;
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

// 3. Branch Stock Adjustment Form (for Opening Balance, Recount, Damage, etc.)
export async function adjustBranchStock(
  vendorId: string,
  branchId: string,
  branchName: string,
  type: 'opening_balance' | 'recount' | 'damage' | 'return' | 'other',
  items: { productId: string; productName: string; quantityDelta: number; reason?: string }[],
  notes?: string
): Promise<StockAdjustment> {
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
export async function processPOSOrder(vendorId: string, orderData: Omit<Order, 'id' | 'createdAt' | 'status'>): Promise<Order> {
  const now = new Date().toISOString();
  const orderId = `ord_${Math.random().toString(36).substring(2, 9)}`;

  const order: Order = {
    ...orderData,
    id: orderId,
    status: 'completed',
    createdAt: now,
  };

  // Decrement Branch Stock for sold items
  const brStock = await fetchBranchStock(vendorId, orderData.branchId);
  orderData.items.forEach(item => {
    const prev = brStock[item.product.id] || 0;
    brStock[item.product.id] = Math.max(0, prev - item.quantity);
  });

  try {
    await setDoc(doc(db, 'vendors', vendorId, 'orders', orderId), order);
    for (const item of orderData.items) {
      const brInvId = `${vendorId}_${orderData.branchId}_${item.product.id}`;
      await setDoc(doc(db, 'vendors', vendorId, 'branch_inventory', brInvId), {
        id: brInvId,
        vendorId,
        branchId: orderData.branchId,
        productId: item.product.id,
        quantity: brStock[item.product.id],
        lastUpdated: now
      });
    }
  } catch (e) {
    console.warn('Firestore process order error', e);
  }

  localStorage.setItem(`${LOCAL_STORAGE_KEY}_br_stock_${vendorId}_${orderData.branchId}`, JSON.stringify(brStock));
  const existingOrdersRaw = localStorage.getItem(`${LOCAL_STORAGE_KEY}_orders_${vendorId}`);
  const existingOrders = existingOrdersRaw ? JSON.parse(existingOrdersRaw) : [];
  localStorage.setItem(`${LOCAL_STORAGE_KEY}_orders_${vendorId}`, JSON.stringify([order, ...existingOrders]));

  return order;
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
  sysadmin: ['desk', 'pos', 'delivery', 'warehouse', 'transfers', 'branches', 'products', 'financial', 'customers', 'reports', 'approvals', 'staff', 'bi_audit', 'settings', 'billing'],
  manager: ['desk', 'pos', 'delivery', 'warehouse', 'transfers', 'branches', 'products', 'financial', 'customers', 'reports', 'approvals', 'settings', 'billing'],
  cashier: ['desk', 'pos', 'customers', 'reports'],
  warehouse_staff: ['desk', 'warehouse', 'transfers', 'products', 'approvals'],
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

// Fetch Approval Requests
export async function fetchApprovalRequests(vendorId: string): Promise<ApprovalRequest[]> {
  try {
    const colRef = collection(db, 'vendors', vendorId, 'approval_requests');
    const snap = await getDocs(colRef);
    if (!snap.empty) {
      const list = snap.docs.map(d => d.data() as ApprovalRequest);
      list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      return list;
    }
  } catch (e) {
    console.warn(e);
  }

  const raw = localStorage.getItem(`${LOCAL_STORAGE_KEY}_approvals_${vendorId}`);
  if (raw) return JSON.parse(raw);

  // Return initial demo approval request if clean state
  const now = new Date().toISOString();
  const demoRequest: ApprovalRequest = {
    id: `appr_demo_01`,
    vendorId,
    type: 'stock_adjustment',
    title: 'High-Value Damage Stock Adjustment Approval',
    description: '3 damaged units of Wireless Bluetooth Barcode Scanner pending verification before inventory reduction.',
    requesterId: `staff_${vendorId}_cashier`,
    requesterName: 'Sarah Chen',
    requesterRole: 'cashier',
    branchName: 'Main Branch',
    dataPayload: {
      branchId: `br_${vendorId}_default`,
      type: 'damage',
      items: [{ productId: 'prod_002', productName: 'Wireless Bluetooth Barcode Scanner', quantityDelta: -3, reason: 'Damaged in transit' }]
    },
    status: 'pending',
    createdAt: now,
  };

  localStorage.setItem(`${LOCAL_STORAGE_KEY}_approvals_${vendorId}`, JSON.stringify([demoRequest]));
  return [demoRequest];
}

// Create Approval Request
export async function createApprovalRequest(
  vendorId: string,
  requestData: Omit<ApprovalRequest, 'id' | 'createdAt' | 'status'>
): Promise<ApprovalRequest> {
  const now = new Date().toISOString();
  const id = `appr_${Math.random().toString(36).substring(2, 9)}`;

  const req: ApprovalRequest = {
    ...requestData,
    id,
    status: 'pending',
    createdAt: now,
  };

  try {
    await setDoc(doc(db, 'vendors', vendorId, 'approval_requests', id), req);
  } catch (e) {
    console.warn(e);
  }

  const current = await fetchApprovalRequests(vendorId);
  localStorage.setItem(`${LOCAL_STORAGE_KEY}_approvals_${vendorId}`, JSON.stringify([req, ...current]));

  // Log in BI
  await logBIEvent(
    vendorId,
    'APPROVAL_REQUESTED',
    `Critical Transaction Approval Requested: ${req.title} by ${req.requesterName} (${req.requesterRole})`,
    { requestId: req.id, type: req.type, requesterId: req.requesterId },
    { staffId: req.requesterId, staffName: req.requesterName, staffRole: req.requesterRole }
  );

  return req;
}

// Review (Approve or Reject) Approval Request
export async function reviewApprovalRequest(
  vendorId: string,
  requestId: string,
  status: 'approved' | 'rejected',
  reviewer: { id: string; name: string; role: StaffRole },
  comment?: string
): Promise<ApprovalRequest | null> {
  const now = new Date().toISOString();
  const requests = await fetchApprovalRequests(vendorId);
  const target = requests.find(r => r.id === requestId);
  if (!target) return null;

  const updated: ApprovalRequest = {
    ...target,
    status,
    reviewedBy: reviewer.id,
    reviewedByName: reviewer.name,
    reviewedAt: now,
    reviewComment: comment || (status === 'approved' ? 'Approved by Authorized Officer' : 'Rejected by Manager'),
  };

  try {
    await setDoc(doc(db, 'vendors', vendorId, 'approval_requests', requestId), updated);
  } catch (e) {
    console.warn(e);
  }

  const updatedList = requests.map(r => r.id === requestId ? updated : r);
  localStorage.setItem(`${LOCAL_STORAGE_KEY}_approvals_${vendorId}`, JSON.stringify(updatedList));

  // If approved and type is stock_adjustment, update warehouse or branch inventory
  if (status === 'approved' && target.type === 'stock_adjustment' && target.dataPayload) {
    const payload = target.dataPayload;
    const locationType = payload.locationType || 'branch';
    const locationId = payload.locationId || payload.branchId || 'default';
    const items = payload.items || [];

    if (locationType === 'warehouse') {
      const whStock = await fetchWarehouseStock(vendorId, locationId);
      items.forEach((i: any) => {
        const prev = whStock[i.productId] || 0;
        whStock[i.productId] = Math.max(0, prev + (i.quantityDelta || 0));
      });
      localStorage.setItem(`${LOCAL_STORAGE_KEY}_wh_stock_${vendorId}_${locationId}`, JSON.stringify(whStock));
      for (const i of items) {
        const whInvId = `${vendorId}_${locationId}_${i.productId}`;
        await setDoc(doc(db, 'vendors', vendorId, 'warehouse_inventory', whInvId), {
          id: whInvId,
          vendorId,
          warehouseId: locationId,
          productId: i.productId,
          quantity: whStock[i.productId],
          lastUpdated: now
        }).catch(e => console.warn(e));
      }
    } else {
      const brStock = await fetchBranchStock(vendorId, locationId);
      items.forEach((i: any) => {
        const prev = brStock[i.productId] || 0;
        brStock[i.productId] = Math.max(0, prev + (i.quantityDelta || 0));
      });
      localStorage.setItem(`${LOCAL_STORAGE_KEY}_br_stock_${vendorId}_${locationId}`, JSON.stringify(brStock));
      for (const i of items) {
        const brInvId = `${vendorId}_${locationId}_${i.productId}`;
        await setDoc(doc(db, 'vendors', vendorId, 'branch_inventory', brInvId), {
          id: brInvId,
          vendorId,
          branchId: locationId,
          productId: i.productId,
          quantity: brStock[i.productId],
          lastUpdated: now
        }).catch(e => console.warn(e));
      }
    }

    // Record StockAdjustment history
    const adjId = `adj_${Math.random().toString(36).substring(2, 9)}`;
    const adjustment: StockAdjustment = {
      id: adjId,
      vendorId,
      branchId: locationId,
      branchName: payload.locationName || 'Location Depot',
      type: 'recount',
      date: now,
      items: items.map((i: any) => ({
        productId: i.productId,
        productName: i.productName,
        quantityDelta: i.quantityDelta,
        unitCost: i.costPrice || 0,
        reason: i.reason || 'Approved Stocktake Recount'
      })),
      notes: `Stocktake audit approved by ${reviewer.name} (${reviewer.role})`,
      createdAt: now
    };

    const existingAdjRaw = localStorage.getItem(`${LOCAL_STORAGE_KEY}_adjustments_${vendorId}`);
    const existingAdj = existingAdjRaw ? JSON.parse(existingAdjRaw) : [];
    localStorage.setItem(`${LOCAL_STORAGE_KEY}_adjustments_${vendorId}`, JSON.stringify([adjustment, ...existingAdj]));
  }

  // Log in BI Engine
  await logBIEvent(
    vendorId,
    'APPROVAL_DECISION',
    `Approval ${status.toUpperCase()}: ${target.title} by ${reviewer.name} (${reviewer.role})`,
    { requestId, status, reviewerId: reviewer.id, comment },
    { staffId: reviewer.id, staffName: reviewer.name, staffRole: reviewer.role }
  );

  return updated;
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
    maxBranches: 1,
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
    maxBranches: 3,
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
    maxBranches: 20,
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

  // Default initial subscription (Set expiry date 5 days from now to showcase the 7-day advance auto-invoice generation)
  const now = new Date();
  const expiry = new Date();
  expiry.setDate(now.getDate() + 5); // 5 days remaining -> triggers 7-day auto-invoice rule

  const defaultSub: VendorSubscription = {
    id: `sub_${vendorId}`,
    vendorId,
    planId: 'pro_commerce',
    planName: 'Pro Commerce & Multi-Terminal',
    priceMonthly: 49,
    billingPeriodMonths: 1,
    startDate: new Date(now.getTime() - 25 * 24 * 60 * 60 * 1000).toISOString(),
    expiryDate: expiry.toISOString(),
    autoRenew: true,
    status: 'expiring_soon'
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


