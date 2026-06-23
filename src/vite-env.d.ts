/// <reference types="vite/client" />

// Typed access to the Supabase env vars (read via import.meta.env). The browser
// only ever sees the ANON (publishable) key — never the service-role/secret key.
interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
  // 'true' to surface social-login buttons (Google/Apple). Off by default until
  // the OAuth providers are configured in the Supabase dashboard.
  readonly VITE_ENABLE_SOCIAL_AUTH?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
