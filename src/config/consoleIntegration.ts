export interface ConsoleIntegrationConfig {
  enabled: boolean;
  baseUrl?: string;
  developmentHeadersEnabled: boolean;
  valid: boolean;
  errorCode?: 'console_url_missing' | 'insecure_header_auth_refused';
}

function enabled(value: string | boolean | undefined): boolean {
  return value === true || value === 'true';
}

export function resolveConsoleIntegrationConfig(
  env: Record<string, string | boolean | undefined> = import.meta.env,
  isDevelopment = import.meta.env.DEV,
): ConsoleIntegrationConfig {
  const integrationEnabled = enabled(env.VITE_ENABLE_CONSOLE_INTEGRATION);
  const developmentHeadersEnabled = enabled(env.VITE_ENABLE_CONSOLE_DEVELOPMENT_HEADERS);
  const baseUrl = typeof env.VITE_CONSOLE_API_BASE_URL === 'string'
    ? env.VITE_CONSOLE_API_BASE_URL.trim().replace(/\/+$/, '')
    : undefined;

  if (integrationEnabled && !baseUrl) {
    return { enabled: true, developmentHeadersEnabled, valid: false, errorCode: 'console_url_missing' };
  }
  if (integrationEnabled && developmentHeadersEnabled && !isDevelopment) {
    return { enabled: true, baseUrl, developmentHeadersEnabled, valid: false, errorCode: 'insecure_header_auth_refused' };
  }
  return { enabled: integrationEnabled, baseUrl, developmentHeadersEnabled, valid: true };
}
