/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_TENANT_ID: string;
  readonly VITE_CLIENT_ID: string;
  readonly VITE_API_CLIENT_ID?: string;
  readonly VITE_API_SCOPE: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
