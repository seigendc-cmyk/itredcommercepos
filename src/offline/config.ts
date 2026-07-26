export const CONTROLLED_OFFLINE_CHECKOUT_SOT_APPROVED = true as const;

export function isOfflineInfrastructureEnabled(
  value: string | boolean | undefined = import.meta.env?.VITE_ENABLE_OFFLINE_INFRASTRUCTURE,
): boolean {
  return value === true || value === 'true';
}

export function isControlledOfflineCheckoutEnabled(
  value: string | boolean | undefined = import.meta.env?.VITE_ENABLE_CONTROLLED_OFFLINE_CHECKOUT,
): boolean {
  return CONTROLLED_OFFLINE_CHECKOUT_SOT_APPROVED && (value === true || value === 'true');
}
