import type { Firestore, Transaction } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { InventoryPostingEngine } from '../../src/features/inventory/application/inventoryPostingEngine.js';
import type { InventoryRepository } from '../../src/features/inventory/application/inventoryRepository.js';
import { type InventoryBalance, type InventoryMovement, type StockLocation } from '../../src/features/inventory/domain/index.js';
import { clean, type D, safe, authority, event, command, saveCommand } from './stocktakeCommands.js';

type ReversalQuantities = Record<string, number>;

function requestedQuantity(data: D, movementId: string, remaining: number): number {
  const quantities = data.quantities as ReversalQuantities | undefined;
  const requested = quantities?.[movementId];
  if (quantities && requested === undefined) return 0;
  const quantity = requested === undefined ? remaining : Number(requested);
  if (!Number.isFinite(quantity) || quantity <= 0) throw new HttpsError('invalid-argument', `Reversal quantity for ${movementId} must be positive and finite.`);
  if (quantity > remaining) throw new HttpsError('failed-precondition', `Reversal quantity for ${movementId} exceeds the unreversed quantity.`);
  return quantity;
}

function reversalRepository(tx: Transaction, db: Firestore, stocktake: D, location: StockLocation, balances: Map<string, InventoryBalance>, legacy: Map<string, D>, movements: Map<string, InventoryMovement>): InventoryRepository {
  return {
    async getStockLocation(id) { return id === location.id ? location : null; },
    async getBalance(_tenant, _vendor, _location, productId) { return balances.get(productId) || null; },
    async getMovementByIdempotencyKey(_tenant, _vendor, key) { return movements.get(key) || null; },
    async saveMovement(movement) { movements.set(movement.idempotencyKey, movement); tx.create(db.doc(`vendors/${stocktake.vendorId}/inventory_movements/${movement.id}`), clean(movement)); },
    async saveBalance(balance) {
      balances.set(balance.productId, balance);
      tx.set(db.doc(`vendors/${stocktake.vendorId}/inventory_balances/${balance.id}`), clean(balance));
      const collection = stocktake.locationType === 'WAREHOUSE' ? 'warehouse_inventory' : 'branch_inventory';
      const id = `${stocktake.vendorId}_${stocktake.locationId}_${balance.productId}`;
      tx.set(db.doc(`vendors/${stocktake.vendorId}/${collection}/${id}`), clean({ ...legacy.get(balance.productId), id, tenantId: stocktake.vendorId, vendorId: stocktake.vendorId,
        [stocktake.locationType === 'WAREHOUSE' ? 'warehouseId' : 'branchId']: stocktake.locationId, productId: balance.productId, quantity: balance.onHandQty,
        reservedQuantity: balance.reservedQty, inTransitQuantity: balance.inTransitQty, quarantinedQuantity: balance.quarantinedQty, damagedQuantity: balance.damagedQty, version: balance.version, lastUpdated: balance.updatedAt }));
    },
    async runAtomic<T>(operation: (repository: InventoryRepository) => Promise<T>) { return operation(this); },
  };
}

export function createStocktakeReversalCallable(db: Firestore) {
  return onCall(async request => {
    const data = request.data as D;
    const vendorId = String(data.vendorId || '').trim(), stocktakeId = String(data.stocktakeId || '').trim(), commandId = String(data.commandId || '').trim(), reason = String(data.reason || '').trim();
    if (!vendorId || !stocktakeId || !commandId || !reason) throw new HttpsError('invalid-argument', 'vendorId, stocktakeId, commandId and reason are required.');
    return db.runTransaction(async tx => {
      const member = await authority(tx, db, request.auth?.uid, vendorId, 'inventory.adjust');
      const prior = await command(tx, db, vendorId, commandId, 'REVERSE'); if (prior.result) return prior.result;
      const stocktakeRef = db.doc(`vendors/${vendorId}/stocktakes/${stocktakeId}`), stocktakeSnapshot = await tx.get(stocktakeRef);
      if (!stocktakeSnapshot.exists) throw new HttpsError('not-found', 'Stocktake not found.');
      const stocktake = stocktakeSnapshot.data()!;
      if (stocktake.vendorId !== vendorId || stocktake.tenantId !== vendorId || !['POSTED', 'PARTIALLY_REVERSED'].includes(stocktake.status)) throw new HttpsError('failed-precondition', 'Only a posted tenant-owned stocktake can be reversed.');
      const originalIds = stocktake.movementIds as string[] || []; if (!originalIds.length) throw new HttpsError('failed-precondition', 'Stocktake has no adjustment movements.');
      const originalSnapshots = await tx.getAll(...originalIds.map(id => db.doc(`vendors/${vendorId}/inventory_movements/${id}`)));
      if (originalSnapshots.some(snapshot => !snapshot.exists)) throw new HttpsError('failed-precondition', 'Original adjustment movement is missing.');
      const originals = originalSnapshots.map(snapshot => snapshot.data() as InventoryMovement);
      for (const original of originals) {
        const belongsToStocktake = original.tenantId === vendorId && original.vendorId === vendorId && original.locationId === stocktake.locationId
          && original.locationType === stocktake.locationType && original.movementType === 'STOCKTAKE_ADJUSTMENT'
          && original.referenceType === 'STOCKTAKE' && original.referenceId === stocktakeId && !original.reversalOfMovementId;
        if (!belongsToStocktake) throw new HttpsError('failed-precondition', 'Original adjustment movement does not belong to this stocktake and location.');
      }
      const reversedQuantities: ReversalQuantities = { ...(stocktake.reversalSummary?.reversedQuantities || {}) };
      const reversalPlan = originals.map(original => {
        const remaining = original.quantity - Number(reversedQuantities[original.id] || 0);
        if (remaining <= 0) return { original, remaining, quantity: 0 };
        return { original, remaining, quantity: requestedQuantity(data, original.id, remaining) };
      }).filter(item => item.quantity > 0);
      if (!reversalPlan.length) throw new HttpsError('failed-precondition', 'The stocktake adjustment is already fully reversed.');
      const reversalRefs = reversalPlan.map(({ original }) => db.doc(`vendors/${vendorId}/inventory_movements/${safe(`stocktake-reversal:${stocktakeId}:${commandId}:${original.id}`)}`));
      const balanceRefs = originals.map(original => db.doc(`vendors/${vendorId}/inventory_balances/${encodeURIComponent(vendorId)}::${encodeURIComponent(vendorId)}::${encodeURIComponent(stocktake.locationId)}::${encodeURIComponent(original.productId)}`));
      const legacyCollection = stocktake.locationType === 'WAREHOUSE' ? 'warehouse_inventory' : 'branch_inventory';
      const legacyRefs = originals.map(original => db.doc(`vendors/${vendorId}/${legacyCollection}/${vendorId}_${stocktake.locationId}_${original.productId}`));
      const [reversalSnapshots, balanceSnapshots, legacySnapshots, locationSnapshot] = await Promise.all([
        tx.getAll(...reversalRefs), tx.getAll(...balanceRefs), tx.getAll(...legacyRefs), tx.get(db.doc(`vendors/${vendorId}/${stocktake.locationType === 'WAREHOUSE' ? 'warehouses' : 'branches'}/${stocktake.locationId}`)),
      ]);
      const loc = locationSnapshot.data();
      if (!locationSnapshot.exists || loc?.vendorId !== vendorId || String(loc.status).toLowerCase() !== 'active' || String(loc.licenseStatus || loc.licenceStatus).toLowerCase() !== 'licensed') throw new HttpsError('failed-precondition', 'Stocktake location is not active and licensed.');
      const assigned = member.permissions.includes('location.all') || (stocktake.locationType === 'WAREHOUSE' ? member.assignedWarehouseIds : member.assignedBranchIds).includes(stocktake.locationId);
      if (!assigned) throw new HttpsError('permission-denied', 'Location assignment is required.');
      if (reversalSnapshots.some(snapshot => snapshot.exists)) throw new HttpsError('already-exists', 'Reversal movement identity already exists without a command receipt.');
      const balances = new Map<string, InventoryBalance>(), legacy = new Map<string, D>(), movements = new Map<string, InventoryMovement>();
      originals.forEach((original, index) => { const balance = balanceSnapshots[index].data() as InventoryBalance | undefined; if (!balance) throw new HttpsError('failed-precondition', 'Canonical balance is missing.'); balances.set(original.productId, balance); legacy.set(original.productId, legacySnapshots[index].data() || {}); });
      const now = new Date().toISOString();
      const location: StockLocation = { id: stocktake.locationId, tenantId: vendorId, vendorId, type: stocktake.locationType, name: String(loc!.name), code: String(loc!.code), status: 'ACTIVE', licenceStatus: 'LICENSED', createdAt: String(loc!.createdAt || now), updatedAt: String(loc!.updatedAt || now) };
      const engine = new InventoryPostingEngine(reversalRepository(tx, db, stocktake, location, balances, legacy, movements), async () => true, () => now);
      const reversalMovementIds: string[] = [];
      for (const { original, quantity } of reversalPlan) {
        const originalIncrease = !original.sourceLocationId;
        const key = `stocktake-reversal:${stocktakeId}:${commandId}:${original.id}`, movementId = safe(key);
        const result = await engine.post({ commandId: movementId, idempotencyKey: key, tenantId: vendorId, vendorId, productId: original.productId, movementType: 'STOCKTAKE_ADJUSTMENT', quantity,
          ...(originalIncrease ? { sourceLocationId: stocktake.locationId } : { destinationLocationId: stocktake.locationId }), referenceType: 'STOCKTAKE_REVERSAL', referenceId: stocktakeId,
          actorId: member.userUid, occurredAt: now, correlationId: stocktakeId, reasonCode: reason, reversalOfMovementId: original.id });
        reversalMovementIds.push(result.movement.id);
        reversedQuantities[original.id] = Number(reversedQuantities[original.id] || 0) + quantity;
      }
      if (process.env.FUNCTIONS_EMULATOR === 'true' && data.testFailurePoint === 'AFTER_INVENTORY') throw new HttpsError('aborted', 'Injected reversal failure.');
      const fullyReversed = originals.every(original => Number(reversedQuantities[original.id] || 0) === original.quantity);
      const reversalRecord = { commandId, reason, reversedBy: member.userUid, reversedAt: now, movementIds: reversalMovementIds,
        quantities: Object.fromEntries(reversalPlan.map(({ original, quantity }) => [original.id, quantity])) };
      const updated = clean({ ...stocktake, status: fullyReversed ? 'REVERSED' : 'PARTIALLY_REVERSED', version: Number(stocktake.version) + 1, updatedAt: now,
        reversalSummary: { reversedQuantities, remainingQuantities: Object.fromEntries(originals.map(original => [original.id, original.quantity - Number(reversedQuantities[original.id] || 0)])) },
        reversalHistory: [...(stocktake.reversalHistory || []), reversalRecord] });
      tx.set(stocktakeRef, updated); event(tx, db, updated, fullyReversed ? 'STOCKTAKE_REVERSED' : 'STOCKTAKE_PARTIALLY_REVERSED', member.userUid, commandId, now, { role: member.roleId, reasonCode: reason });
      saveCommand(tx, prior.r, updated, 'REVERSE', commandId, member.userUid, now, updated); return updated;
    });
  });
}
