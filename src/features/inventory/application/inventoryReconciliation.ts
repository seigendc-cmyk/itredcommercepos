import {
  InventoryBalance,
  InventoryMovement,
  InventoryPostingCommand,
  InventoryQuantityBucket,
} from '../domain';

export interface InventoryReconciliationFinding {
  tenantId: string;
  vendorId: string;
  stockLocationId: string;
  productId: string;
  bucket: 'onHandQty' | 'inTransitQty' | 'quarantinedQty' | 'damagedQty';
  ledgerQuantity: number;
  balanceQuantity: number;
  difference: number;
}

type ReconciledQuantities = Pick<InventoryBalance, 'onHandQty' | 'inTransitQty' | 'quarantinedQty' | 'damagedQty'>;

function key(tenantId: string, vendorId: string, locationId: string, productId: string): string {
  return [tenantId, vendorId, locationId, productId].join('|');
}

function emptyQuantities(): ReconciledQuantities {
  return { onHandQty: 0, inTransitQty: 0, quarantinedQty: 0, damagedQty: 0 };
}

function bucketField(bucket: InventoryQuantityBucket | undefined): keyof ReconciledQuantities {
  if (bucket === 'QUARANTINED') return 'quarantinedQty';
  if (bucket === 'DAMAGED') return 'damagedQty';
  return 'onHandQty';
}

export function reconcileInventoryBalances(
  balances: readonly InventoryBalance[],
  movements: readonly InventoryMovement[],
): InventoryReconciliationFinding[] {
  const expected = new Map<string, ReconciledQuantities>();
  const identities = new Map<string, Pick<InventoryBalance, 'tenantId' | 'vendorId' | 'stockLocationId' | 'productId'>>();
  const quantities = (tenantId: string, vendorId: string, locationId: string, productId: string) => {
    const identityKey = key(tenantId, vendorId, locationId, productId);
    if (!expected.has(identityKey)) expected.set(identityKey, emptyQuantities());
    identities.set(identityKey, { tenantId, vendorId, stockLocationId: locationId, productId });
    return expected.get(identityKey)!;
  };

  [...movements].sort((left, right) => left.recordedAt.localeCompare(right.recordedAt)).forEach(movement => {
    if (movement.sourceLocationId && movement.movementType !== 'TRANSFER_RECEIPT') {
      quantities(movement.tenantId, movement.vendorId, movement.sourceLocationId, movement.productId).onHandQty -= movement.quantity;
    }
    if (movement.destinationLocationId) {
      const destination = quantities(movement.tenantId, movement.vendorId, movement.destinationLocationId, movement.productId);
      if (movement.movementType === 'TRANSFER_DISPATCH') destination.inTransitQty += movement.quantity;
      else if (movement.movementType === 'TRANSFER_RECEIPT') {
        destination.inTransitQty -= movement.quantity;
        destination.onHandQty += movement.quantity;
      } else destination[bucketField(movement.quantityBucket)] += movement.quantity;
    }
  });

  const actual = new Map<string, InventoryBalance>();
  balances.forEach(balance => {
    const identityKey = key(balance.tenantId, balance.vendorId, balance.stockLocationId, balance.productId);
    actual.set(identityKey, balance);
    identities.set(identityKey, balance);
  });

  const findings: InventoryReconciliationFinding[] = [];
  for (const [identityKey, identity] of identities) {
    const ledger = expected.get(identityKey) ?? emptyQuantities();
    const balance = actual.get(identityKey);
    for (const bucket of ['onHandQty', 'inTransitQty', 'quarantinedQty', 'damagedQty'] as const) {
      const balanceQuantity = balance?.[bucket] ?? 0;
      const ledgerQuantity = ledger[bucket];
      if (balanceQuantity !== ledgerQuantity) findings.push({
        ...identity,
        bucket,
        ledgerQuantity,
        balanceQuantity,
        difference: balanceQuantity - ledgerQuantity,
      });
    }
  }
  return findings;
}

export function createCompensatingInventoryCommand(
  original: InventoryMovement,
  input: { correctionId: string; actorId: string; occurredAt: string; reasonCode: string },
): InventoryPostingCommand {
  if (original.sourceLocationId && original.destinationLocationId) {
    throw new Error('Two-location transfer corrections require a controlled transfer reversal workflow.');
  }
  const originalReducedStock = Boolean(original.sourceLocationId);
  const locationId = original.sourceLocationId || original.destinationLocationId;
  if (!locationId) throw new Error('Original movement has no affected stock location.');
  return {
    commandId: ['reversal', original.id, input.correctionId].map(encodeURIComponent).join('_'),
    idempotencyKey: ['reversal', original.tenantId, original.vendorId, original.id, input.correctionId].map(encodeURIComponent).join(':'),
    tenantId: original.tenantId,
    vendorId: original.vendorId,
    productId: original.productId,
    movementType: 'MANUAL_ADJUSTMENT',
    quantity: original.quantity,
    ...(originalReducedStock ? { destinationLocationId: locationId } : { sourceLocationId: locationId }),
    referenceType: 'INVENTORY_REVERSAL',
    referenceId: input.correctionId,
    actorId: input.actorId,
    correlationId: original.correlationId,
    reasonCode: input.reasonCode,
    reversalOfMovementId: original.id,
    occurredAt: input.occurredAt,
  };
}
