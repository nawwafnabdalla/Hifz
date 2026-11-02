import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { RemoteError, type Remote } from './sync'

export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined
export const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined
/** The phrase-audio TEST build never talks to the cloud, even if variables are set: it must not be able to touch real records. */
export const TEST_BUILD = import.meta.env.VITE_PHRASE_AUDIO === '1'
export const cloudConfigured = !TEST_BUILD && Boolean(SUPABASE_URL && SUPABASE_KEY)

let client: SupabaseClient | null = null
export function supabase(): SupabaseClient | null {
  if (!cloudConfigured) return null
  client ??= createClient(SUPABASE_URL!, SUPABASE_KEY!, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce' },
  })
  return client
}

function toRemoteError(e: { message?: string; code?: string; status?: number }): RemoteError {
  const status = e.status ?? 0
  const code = e.code ?? ''
  // Constraint/validation failures will never succeed on retry. Auth, rate limits and network errors might.
  const permanent = /^(22|23|P0001|42501)/.test(code) ? code !== '42501' : status === 400 || status === 422 || status === 409
  return new RemoteError(e.message ?? 'Request failed', permanent, code)
}

export function supabaseRemote(c: SupabaseClient, userId: string): Remote {
  return {
    userId: () => userId,
    async upsert(table, rows, opts) {
      const { error } = await c.from(table).upsert(rows, { onConflict: opts.onConflict, ignoreDuplicates: opts.ignoreDuplicates })
      if (error) throw toRemoteError(error as never)
    },
    async pull(table, afterSeq, limit) {
      const { data, error } = await c.from(table).select('*').gt('seq', afterSeq).order('seq', { ascending: true }).limit(limit)
      if (error) throw toRemoteError(error as never)
      return (data ?? []) as Record<string, unknown>[]
    },
  }
}
