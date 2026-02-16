/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL: string;
  readonly VITE_SIGNALR_URL: string;
  readonly VITE_AZURE_CLIENT_ID: string;
  readonly VITE_AZURE_TENANT_ID: string;
  readonly VITE_AZURE_REDIRECT_URI: string;
  readonly VITE_SKIP_AUTH: string;
  readonly VITE_TEST_ENTERPRISE_ID: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
