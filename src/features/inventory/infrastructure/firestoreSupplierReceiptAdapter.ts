import { doc } from 'firebase/firestore';
import type { Transaction } from 'firebase/firestore';
import { db } from '../../../lib/firebase';
import {
  ApprovedSupplierReceiptPostingInput, postApprovedSupplierReceipt,
  PostedSupplierReceipt, SupplierReceiptInventoryMovement, SupplierReceiptPostingResult,
  SupplierReceiptPostingError,
} from '../../../services/supplierReceiptPosting';
import { normalizeProduct } from '../../../types';
import type { Product, PurchaseOrder, Warehouse, WarehouseInventory } from '../../../types';

function firestoreValue<T>(value: T): T {
  if (Array.isArray(value)) return value.map(item => firestoreValue(item)) as T;
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined).map(([key, item]) => [key, firestoreValue(item)])) as T;
  }
  return value;
}

export function postApprovedSupplierReceiptInFirestoreTransaction(
  transaction: Transaction,
  input: ApprovedSupplierReceiptPostingInput,
): Promise<SupplierReceiptPostingResult> {
  const { vendorId } = input;
  return postApprovedSupplierReceipt(input, {
    async getReceipt(receiptId) {
      const snapshot = await transaction.get(doc(db, 'vendors', vendorId, 'supplier_receipts', receiptId));
      return snapshot.exists() ? snapshot.data() as PostedSupplierReceipt : null;
    },
    async getWarehouse(warehouseId) {
      const snapshot = await transaction.get(doc(db, 'vendors', vendorId, 'warehouses', warehouseId));
      return snapshot.exists() ? snapshot.data() as Warehouse : null;
    },
    async getProduct(productId) {
      const snapshot = await transaction.get(doc(db, 'vendors', vendorId, 'products', productId));
      return snapshot.exists() ? normalizeProduct(snapshot.data() as Product) : null;
    },
    async getInventory(warehouseId, productId) {
      const inventoryId = `${vendorId}_${warehouseId}_${productId}`;
      const snapshot = await transaction.get(doc(db, 'vendors', vendorId, 'warehouse_inventory', inventoryId));
      return snapshot.exists() ? snapshot.data() as WarehouseInventory : null;
    },
    async getMovement(idempotencyKey, movementId) {
      const snapshot = await transaction.get(doc(db, 'vendors', vendorId, 'inventory_movements', movementId));
      if (!snapshot.exists()) return null;
      const movement = snapshot.data() as SupplierReceiptInventoryMovement;
      return movement.idempotencyKey === idempotencyKey ? movement : null;
    },
    async getPurchaseOrder(purchaseOrderId) {
      const snapshot = await transaction.get(doc(db, 'vendors', vendorId, 'purchase_orders', purchaseOrderId));
      return snapshot.exists() ? snapshot.data() as PurchaseOrder : null;
    },
    saveInventory(inventory) {
      transaction.set(doc(db, 'vendors', vendorId, 'warehouse_inventory', inventory.id), firestoreValue(inventory));
    },
    saveMovement(movement) {
      transaction.set(doc(db, 'vendors', vendorId, 'inventory_movements', movement.id), firestoreValue(movement));
    },
    savePurchaseOrder(purchaseOrder) {
      transaction.set(doc(db, 'vendors', vendorId, 'purchase_orders', purchaseOrder.id), firestoreValue(purchaseOrder));
    },
    saveReceipt(receipt) {
      transaction.set(doc(db, 'vendors', vendorId, 'supplier_receipts', receipt.id), firestoreValue(receipt));
    },
  }).catch(error => {
    if (error instanceof SupplierReceiptPostingError) throw error;
    throw new SupplierReceiptPostingError('write_failure', 'The approved supplier receipt could not be committed.');
  });
}
