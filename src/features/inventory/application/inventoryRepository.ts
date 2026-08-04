import { InventoryBalance, InventoryMovement, StockLocation } from '../domain';

export interface InventoryRepository {
  getStockLocation(stockLocationId: string): Promise<StockLocation | null>;
  getBalance(tenantId: string, vendorId: string, stockLocationId: string, productId: string): Promise<InventoryBalance | null>;
  getMovementByIdempotencyKey(tenantId: string, vendorId: string, idempotencyKey: string): Promise<InventoryMovement | null>;
  saveMovement(movement: InventoryMovement): Promise<void>;
  saveBalance(balance: InventoryBalance): Promise<void>;
  runAtomic<T>(operation: (repository: InventoryRepository) => Promise<T>): Promise<T>;
}

export interface ProductIdentityValidationRequest { tenantId: string; vendorId: string; productId: string; }
export type ProductIdentityValidator = (request: ProductIdentityValidationRequest) => boolean | Promise<boolean>;
