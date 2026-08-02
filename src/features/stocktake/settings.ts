export interface StocktakeSettings {
  blindCountEnabled: boolean;
}

const DEFAULT_STOCKTAKE_SETTINGS: StocktakeSettings = { blindCountEnabled: true };

export function loadStocktakeSettings(vendorId: string): StocktakeSettings {
  try {
    const raw = localStorage.getItem(`itred_stocktake_settings_${vendorId}`);
    return raw ? { ...DEFAULT_STOCKTAKE_SETTINGS, ...JSON.parse(raw) } : DEFAULT_STOCKTAKE_SETTINGS;
  } catch {
    return DEFAULT_STOCKTAKE_SETTINGS;
  }
}
