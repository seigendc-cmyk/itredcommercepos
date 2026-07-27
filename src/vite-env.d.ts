/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_ENABLE_DEMO_LOGIN?: string;
  readonly VITE_ENABLE_OFFLINE_INFRASTRUCTURE?: string;
  readonly VITE_ENABLE_CONTROLLED_OFFLINE_CHECKOUT?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
