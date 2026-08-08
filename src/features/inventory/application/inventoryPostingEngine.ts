import {
  emptyInventoryBalance, immutableInventoryMovement, InventoryBalance, InventoryDomainError,
  InventoryMovement, InventoryPostingCommand, InventoryPostingResult, StockLocation,
  validateInventoryBalance, validateInventoryMovementRoute, validateInventoryPostingCommand,
} from '../domain';
import { InventoryRepository, ProductIdentityValidator } from './inventoryRepository';

export class InventoryPostingEngine {
  constructor(
    private readonly repository: InventoryRepository,
    private readonly validateProduct: ProductIdentityValidator,
    private readonly now: () => string = () => new Date().toISOString(),
  ) {}

  async post(command: InventoryPostingCommand): Promise<InventoryPostingResult> {
    validateInventoryPostingCommand(command);
    if (!await this.validateProduct({ tenantId: command.tenantId, vendorId: command.vendorId, productId: command.productId })) {
      throw new InventoryDomainError('PRODUCT_NOT_FOUND', 'Product identity is not an active canonical product.');
    }

    return this.repository.runAtomic(async (repository) => {
      const duplicate = await repository.getMovementByIdempotencyKey(command.tenantId, command.vendorId, command.idempotencyKey);
      if (duplicate) return { movement: duplicate, balances: await this.readExistingBalances(repository, command), duplicate: true };

      const [source, destination] = await Promise.all([
        command.sourceLocationId ? repository.getStockLocation(command.sourceLocationId) : undefined,
        command.destinationLocationId ? repository.getStockLocation(command.destinationLocationId) : undefined,
      ]);
      this.validateLocation(command, command.sourceLocationId, source, 'source');
      this.validateLocation(command, command.destinationLocationId, destination, 'destination');
      validateInventoryMovementRoute(command, source ?? undefined, destination ?? undefined);

      const recordedAt = this.now();
      const sourceAffected = Boolean(command.sourceLocationId) && command.movementType !== 'TRANSFER_RECEIPT';
      const destinationAffected = Boolean(command.destinationLocationId) && command.movementType !== 'TRANSFER_DISPATCH';
      const sourceBalance = sourceAffected ? await this.getOrCreateBalance(repository, command, command.sourceLocationId!, recordedAt) : undefined;
      const destinationBalance = command.destinationLocationId ? await this.getOrCreateBalance(repository, command, command.destinationLocationId, recordedAt) : undefined;
      if (sourceBalance && command.expectedSourceVersion !== undefined && sourceBalance.version !== command.expectedSourceVersion) {
        throw new InventoryDomainError('STALE_BALANCE', 'Source inventory changed after the command was prepared.');
      }
      if (destinationBalance && command.expectedDestinationVersion !== undefined && destinationBalance.version !== command.expectedDestinationVersion) {
        throw new InventoryDomainError('STALE_BALANCE', 'Destination inventory changed after the command was prepared.');
      }
      const sourceBucket = command.movementType === 'SUPPLIER_RECEIPT_REVERSAL' ? (command.quantityBucket ?? 'ON_HAND') : 'ON_HAND';
      if (sourceBalance && this.bucketQuantity(sourceBalance, sourceBucket) < command.quantity) throw new InventoryDomainError('INSUFFICIENT_STOCK', 'Source location has insufficient stock in the affected quantity bucket.');
      if (command.movementType === 'TRANSFER_RECEIPT' && destinationBalance && destinationBalance.inTransitQty < command.quantity) {
        throw new InventoryDomainError('INSUFFICIENT_STOCK', 'Destination location has insufficient in-transit stock.');
      }

      const updatedSource = sourceBalance ? validateInventoryBalance({
        ...sourceBalance,
        ...(sourceBucket === 'QUARANTINED' ? { quarantinedQty: sourceBalance.quarantinedQty - command.quantity }
          : sourceBucket === 'DAMAGED' ? { damagedQty: sourceBalance.damagedQty - command.quantity }
            : { onHandQty: sourceBalance.onHandQty - command.quantity }),
        version: sourceBalance.version + 1,
        updatedAt: recordedAt,
      }) : undefined;
      let updatedDestination: InventoryBalance | undefined;
      const destinationBucket = command.quantityBucket ?? 'ON_HAND';
      if (command.movementType === 'TRANSFER_DISPATCH' && destinationBalance) {
        updatedDestination = validateInventoryBalance({ ...destinationBalance, inTransitQty: destinationBalance.inTransitQty + command.quantity, version: destinationBalance.version + 1, updatedAt: recordedAt });
      } else if (destinationAffected && destinationBalance) {
        const quantityChanges = destinationBucket === 'QUARANTINED'
          ? { quarantinedQty: destinationBalance.quarantinedQty + command.quantity }
          : destinationBucket === 'DAMAGED'
            ? { damagedQty: destinationBalance.damagedQty + command.quantity }
            : { onHandQty: destinationBalance.onHandQty + command.quantity };
        updatedDestination = validateInventoryBalance({
          ...destinationBalance,
          ...quantityChanges,
          inTransitQty: command.movementType === 'TRANSFER_RECEIPT' ? destinationBalance.inTransitQty - command.quantity : destinationBalance.inTransitQty,
          version: destinationBalance.version + 1,
          updatedAt: recordedAt,
        });
      }
      const primaryLocation = updatedSource ? source! : destination!;
      const beforeQuantity = updatedSource ? this.bucketQuantity(sourceBalance!, sourceBucket) : this.bucketQuantity(destinationBalance!, destinationBucket);
      const afterQuantity = updatedSource ? this.bucketQuantity(updatedSource, sourceBucket) : this.bucketQuantity(updatedDestination!, destinationBucket);
      const quantityDelta = afterQuantity - beforeQuantity;
      const movement = immutableInventoryMovement({
        id: command.commandId, idempotencyKey: command.idempotencyKey, tenantId: command.tenantId, vendorId: command.vendorId,
        productId: command.productId, sourceLocationId: command.sourceLocationId, destinationLocationId: command.destinationLocationId,
        movementType: command.movementType, quantity: command.quantity, quantityBucket: command.quantityBucket, sourceBeforeQty: sourceBalance ? this.bucketQuantity(sourceBalance, sourceBucket) : undefined,
        sourceAfterQty: updatedSource ? this.bucketQuantity(updatedSource, sourceBucket) : undefined, destinationBeforeQty: destinationBalance ? this.bucketQuantity(destinationBalance, destinationBucket) : undefined,
        destinationAfterQty: updatedDestination ? this.bucketQuantity(updatedDestination, destinationBucket) : undefined, referenceType: command.referenceType, referenceId: command.referenceId,
        actorId: command.actorId, approvalRequestId: command.approvalRequestId,
        locationId: primaryLocation.id, locationType: primaryLocation.type, quantityDelta, beforeQuantity, afterQuantity,
        sourceType: command.referenceType, sourceId: command.referenceId,
        correlationId: command.correlationId || command.idempotencyKey, reasonCode: command.reasonCode,
        reversalOfMovementId: command.reversalOfMovementId,
        status: 'POSTED', occurredAt: command.occurredAt, recordedAt,
      });
      for (const balance of [updatedSource, updatedDestination]) if (balance) await repository.saveBalance(balance);
      await repository.saveMovement(movement);
      return { movement, balances: [updatedSource, updatedDestination].filter((value): value is InventoryBalance => Boolean(value)), duplicate: false };
    });
  }

  private validateLocation(command: InventoryPostingCommand, id: string | undefined, location: StockLocation | null | undefined, label: string): void {
    if (!id) return;
    if (!location) throw new InventoryDomainError('LOCATION_NOT_FOUND', `${label} stock location was not found.`);
    if (location.tenantId !== command.tenantId || location.vendorId !== command.vendorId) throw new InventoryDomainError('LOCATION_OWNERSHIP_MISMATCH', `${label} stock location does not belong to the command tenant and vendor.`);
    if (location.status !== 'ACTIVE') throw new InventoryDomainError('LOCATION_INACTIVE', `${label} stock location is not active.`);
    if (location.licenceStatus !== 'LICENSED') throw new InventoryDomainError('LOCATION_UNLICENSED', `${label} stock location is not licensed.`);
  }

  private async getOrCreateBalance(repository: InventoryRepository, command: InventoryPostingCommand, locationId: string, updatedAt: string): Promise<InventoryBalance> {
    const balance = await repository.getBalance(command.tenantId, command.vendorId, locationId, command.productId);
    return balance ? validateInventoryBalance(balance) : emptyInventoryBalance({ tenantId: command.tenantId, vendorId: command.vendorId, stockLocationId: locationId, productId: command.productId }, updatedAt);
  }

  private bucketQuantity(balance: InventoryBalance, bucket: 'ON_HAND' | 'QUARANTINED' | 'DAMAGED'): number {
    if (bucket === 'QUARANTINED') return balance.quarantinedQty;
    if (bucket === 'DAMAGED') return balance.damagedQty;
    return balance.onHandQty;
  }

  private async readExistingBalances(repository: InventoryRepository, command: InventoryPostingCommand): Promise<InventoryBalance[]> {
    const ids = [command.sourceLocationId, command.destinationLocationId].filter((id): id is string => Boolean(id));
    const balances = await Promise.all(ids.map((id) => repository.getBalance(command.tenantId, command.vendorId, id, command.productId)));
    return balances.filter((balance): balance is InventoryBalance => Boolean(balance));
  }
}
