/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />
interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string
  /** '1' bundles phrase-audio timings and enables the feature (see src/lib/audio/timings.ts). */
  readonly VITE_PHRASE_AUDIO?: string
}
interface ImportMeta { readonly env: ImportMetaEnv }
