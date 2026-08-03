export function weightedAverageCost(currentQuantity: number, currentAverageCost: number, receivedQuantity: number, receivedTotalCost: number): number {
  if (currentQuantity < 0 || receivedQuantity <= 0 || currentAverageCost < 0 || receivedTotalCost < 0) throw new Error('Average-cost inputs must be non-negative and receipt quantity must be positive.');
  const nextQuantity = currentQuantity + receivedQuantity;
  return ((currentQuantity * currentAverageCost) + receivedTotalCost) / nextQuantity;
}

export function requiresBelowAverageCostApproval(proposedCost: number, averageCost: number): boolean {
  return Number.isFinite(proposedCost) && Number.isFinite(averageCost) && averageCost > 0 && proposedCost >= 0 && proposedCost < averageCost;
}
