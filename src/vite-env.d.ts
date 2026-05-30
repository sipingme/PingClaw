/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_WEB_DEV?: string;
  readonly VITE_HOST_API_PORT?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
