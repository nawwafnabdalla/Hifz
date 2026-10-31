import { RemoteError, type Remote } from '@/lib/store/sync'

type Row = Record<string, any>
/** An in-memory stand-in for the Supabase schema's behaviour: unique keys, seq cursor, stale-write rejection, append-only. */
export class FakeServer {
  tables = new Map<string, Row[]>()
  seq = 0
  /** When true, the next write persists but the response is "lost" (client sees a network error). */
  dropAck = false
  offline = false
  writes = 0

  private rows(t: string) { if (!this.tables.has(t)) this.tables.set(t, []); return this.tables.get(t)! }
  all(t: string) { return this.rows(t) }

  remoteFor(userId: string): Remote {
    return {
      userId: () => userId,
      upsert: async (table, rows, opts) => {
        if (this.offline) throw new TypeError('Failed to fetch')
        const keys = opts.onConflict.split(',').map((k) => k.trim())
        const batch: Row[] = []
        for (const r of rows as Row[]) {
          if (r.surah !== undefined && (r.surah < 1 || r.surah > 114)) throw new RemoteError('violates check constraint', true, '23514')
          batch.push(r)
        }
        for (const r of batch) {
          const full: Row = { ...r, user_id: userId }
          const existing = this.rows(table).find((x) => keys.every((k) => x[k] === full[k]))
          if (existing) {
            if (opts.ignoreDuplicates) continue
            if (full.updated_at && existing.updated_at && full.updated_at < existing.updated_at) continue
            Object.assign(existing, full, { seq: ++this.seq })
          } else {
            this.rows(table).push({ ...full, seq: ++this.seq })
          }
          this.writes++
        }
        if (this.dropAck) { this.dropAck = false; throw new TypeError('network connection lost') }
      },
      pull: async (table, after, limit) => {
        if (this.offline) throw new TypeError('Failed to fetch')
        return this.rows(table).filter((r) => r.user_id === userId && r.seq > after).sort((a, b) => a.seq - b.seq).slice(0, limit).map((r) => ({ ...r }))
      },
    }
  }
}
