/// <reference types="vite/client" />

// Build-time analytics config (see src/analytics.ts). The website ID is not a secret — it ships
// in the client HTML — so it lives in a committed .env.example; only the real value is set per
// deploy. VITE_UMAMI_SRC is optional and defaults to Umami Cloud.
interface ImportMetaEnv {
  readonly VITE_UMAMI_WEBSITE_ID?: string;
  readonly VITE_UMAMI_SRC?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
