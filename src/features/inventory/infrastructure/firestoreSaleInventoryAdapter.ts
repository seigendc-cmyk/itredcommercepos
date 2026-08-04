import { doc, runTransaction } from 'firebase/firestore';
import { db } from '../../../lib/firebase';
import type { AtomicSaleRunner, SaleInventoryMovement } from '../../../services/saleTransaction';
import { normalizeProduct } from '../../../types';
import type { Branch, BranchInventory, Order, Product, Terminal } from '../../../types';

export function createFirestoreAtomicSaleRunner(vendorId: string): AtomicSaleRunner {
  return operation => runTransaction(db, transaction => operation({
    async getOrder(id) {
      const snapshot = await transaction.get(doc(db, 'vendors', vendorId, 'orders', id));
      return snapshot.exists() ? snapshot.data() as Order : null;
    },
    async getTerminal(terminalId) {
      const snapshot = await transaction.get(doc(db, 'vendors', vendorId, 'terminals', terminalId));
      return snapshot.exists() ? snapshot.data() as Terminal : null;
    },
    async getBranch(branchId) {
      const snapshot = await transaction.get(doc(db, 'vendors', vendorId, 'branches', branchId));
      return snapshot.exists() ? snapshot.data() as Branch : null;
    },
    async getProduct(productId) {
      const snapshot = await transaction.get(doc(db, 'vendors', vendorId, 'products', productId));
      return snapshot.exists() ? normalizeProduct(snapshot.data() as Product) : null;
    },
    async getInventory(branchId, productId) {
      const inventoryId = `${vendorId}_${branchId}_${productId}`;
      const snapshot = await transaction.get(doc(db, 'vendors', vendorId, 'branch_inventory', inventoryId));
      return snapshot.exists() ? snapshot.data() as BranchInventory : null;
    },
    async getMovementByIdempotencyKey(idempotencyKey, movementId) {
      const snapshot = await transaction.get(doc(db, 'vendors', vendorId, 'inventory_movements', movementId));
      if (!snapshot.exists()) return null;
      const movement = snapshot.data() as SaleInventoryMovement;
      return movement.idempotencyKey === idempotencyKey ? movement : null;
    },
    setOrder(order) {
      transaction.set(doc(db, 'vendors', vendorId, 'orders', order.id), order);
    },
    setInventory(inventory) {
      transaction.set(doc(db, 'vendors', vendorId, 'branch_inventory', inventory.id), inventory);
    },
    setMovement(movement) {
      const firestoreMovement = Object.fromEntries(
        Object.entries(movement).filter(([, value]) => value !== undefined),
      );
      transaction.set(doc(db, 'vendors', vendorId, 'inventory_movements', movement.id), firestoreMovement);
    },
  }));
}
