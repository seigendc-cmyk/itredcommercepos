const isEnabled = (value: string | undefined): boolean =>
  value?.trim().toLowerCase() === "true";

export const featureFlags = Object.freeze({
  demoLogin: isEnabled(import.meta.env.VITE_ENABLE_DEMO_LOGIN),

  offlineInfrastructure: isEnabled(
    import.meta.env.VITE_ENABLE_OFFLINE_INFRASTRUCTURE,
  ),

  controlledOfflineCheckout: isEnabled(
    import.meta.env.VITE_ENABLE_CONTROLLED_OFFLINE_CHECKOUT,
  ),
});

export type FeatureFlags = typeof featureFlags;
