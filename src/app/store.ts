import { create } from 'zustand'
import { HifzDB } from '@/lib/store/db'
import {
  clearLocalData, exportBackup, importBackup, loadAll, recordDeclaration, recordFlow, recordPart, recordReview, saveExperiment, saveMarker, saveSession, saveSettings, saveTarget, type Snapshot,
} from '@/lib/store/repo'
import { OwnerMismatchError, pendingCount, syncOnce } from '@/lib/store/sync'
import { cloudConfigured, supabase, supabaseRemote } from '@/lib/store/remote'
import { deriveState, type Derived } from '@/lib/engine/derive'
import { DEFAULT_SETTINGS, rangeKey, type Declaration, type Experiment, type FlowEvent, type LearningTarget, type PartEvent, type PhraseMarker, type Range, type ReviewEvent, type Settings, type Strategy } from '@/lib/engine/types'
import type { Plan, PlanItem } from '@/lib/engine/planner'
import { assignArm, armOfAyah, isActive, newExperiment, withAssignment } from '@/lib/engine/experiment'
import { computePlan } from '@/lib/plan'
import { corpus } from '@/lib/quran/data'
import { initScriptFont, setScriptSetting } from '@/lib/quran/script'
import { newId } from '@/lib/store/db'

export const db = new HifzDB()

export interface ActiveSession {
  id: string
  startedAt: number
  plan: Plan
  queue: PlanItem[]
  index: number
  completed: string[]
  skipped: string[]
  /** Items that were completed without being asked, because evidence recorded since the plan was made already covers them (optional: older saves lack it). */
  covered?: string[]
}
export type SyncStatus = 'local' | 'idle' | 'syncing' | 'offline' | 'error' | 'mismatch'
export interface SyncState { status: SyncStatus; pending: number; lastSyncAt: number | null; error: string | null; quarantined: number }

const EMPTY: Snapshot = { reviews: [], flows: [], parts: [], declarations: [], sessions: [], targets: [], markers: [], experiments: [], settings: DEFAULT_SETTINGS }
const SESSION_KEY = 'hifz.activeSession'

type ReviewInput = Omit<ReviewEvent, 'id' | 'occurredAt' | 'sessionId' | 'strategy' | 'experimentId'> & { occurredAt?: number }
type PartInput = Omit<PartEvent, 'id' | 'occurredAt' | 'sessionId'> & { occurredAt?: number }
type FlowInput = Omit<FlowEvent, 'id' | 'occurredAt' | 'sessionId' | 'strategy' | 'experimentId'> & { occurredAt?: number }

interface State {
  ready: boolean
  snap: Snapshot
  derived: Derived
  now: number
  session: ActiveSession | null
  sync: SyncState
  user: { id: string; email: string } | null
  authLoading: boolean
  toast: string | null

  init(): Promise<void>
  refresh(): Promise<void>
  tick(): void
  say(msg: string): void

  logReview(input: ReviewInput): Promise<ReviewEvent>
  logFlow(input: FlowInput): Promise<FlowEvent>
  /** Record a recall of part of an ayah. Evidence of position in a long ayah; never counts as memorising the ayah. */
  logPart(input: PartInput): Promise<PartEvent>
  declare(range: Range, level: Declaration['level']): Promise<void>
  addTarget(range: Range, label?: string): Promise<void>
  setTargetStatus(id: string, status: LearningTarget['status']): Promise<void>
  /** Change a goal's range or name (for example, extend Ta-Ha 1–36 to 1–50). Progress is derived from events, so nothing is lost. */
  updateTarget(id: string, range: Range, label?: string): Promise<void>
  setMarker(surah: number, ayah: number, boundaries: number[]): Promise<void>
  patchSettings(p: Partial<Settings>): Promise<void>

  plan(): Plan
  startSession(plan: Plan): Promise<ActiveSession | null>
  completeItem(id: string, opts?: { covered?: boolean }): void
  skipItem(id: string): void
  endSession(): Promise<void>

  startExperiment(): Promise<void>
  stopExperiment(): Promise<void>
  strategyFor(range: Range): Strategy | undefined

  syncNow(): Promise<void>
  signIn(email: string, password: string): Promise<string | null>
  signUp(email: string, password: string): Promise<string | null>
  signOut(): Promise<void>
  exportJson(): Promise<string>
  importJson(text: string): Promise<string>
  eraseLocal(): Promise<void>
  eraseRemoteAndLocal(): Promise<string | null>
}

let syncTimer: ReturnType<typeof setTimeout> | null = null
let initDone = false

const rebuild = (snap: Snapshot): Derived => deriveState({ reviews: snap.reviews, flows: snap.flows, parts: snap.parts, declarations: snap.declarations }, { corpus })

function applyTheme(s: Settings) {
  const root = document.documentElement
  if (s.theme === 'system') delete root.dataset.theme
  else root.dataset.theme = s.theme
  root.style.setProperty('--arabic-scale', String(s.arabicScale))
  setScriptSetting(s.script)
  try { localStorage.setItem('hifz.theme', s.theme) } catch { /* private mode */ }
}

export const useApp = create<State>((set, get) => {
  const commit = (snap: Snapshot) => set({ snap, derived: rebuild(snap), now: Date.now() })
  const scheduleSync = () => {
    if (!get().user) { void refreshPending(); return }
    if (syncTimer) clearTimeout(syncTimer)
    syncTimer = setTimeout(() => void get().syncNow(), 1500)
    void refreshPending()
  }
  const refreshPending = async () => {
    const pending = await pendingCount(db)
    set((s) => ({ sync: { ...s.sync, pending } }))
  }
  const activeExperiment = (): Experiment | undefined => {
    const now = Date.now()
    return get().snap.experiments.find((x) => isActive(x, now))
  }
  const persistSession = (s: ActiveSession | null) => {
    try { if (s) localStorage.setItem(SESSION_KEY, JSON.stringify(s)); else localStorage.removeItem(SESSION_KEY) } catch { /* ignore */ }
  }

  return {
    ready: false,
    snap: EMPTY,
    derived: rebuild(EMPTY),
    now: Date.now(),
    session: null,
    sync: { status: cloudConfigured ? 'idle' : 'local', pending: 0, lastSyncAt: null, error: null, quarantined: 0 },
    user: null,
    authLoading: cloudConfigured,
    toast: null,

    async init() {
      if (initDone) return
      initDone = true
      const snap = await loadAll(db)
      applyTheme(snap.settings)
      void initScriptFont()
      let session: ActiveSession | null = null
      try { const raw = localStorage.getItem(SESSION_KEY); if (raw) session = JSON.parse(raw) as ActiveSession } catch { session = null }
      set({ snap, derived: rebuild(snap), ready: true, now: Date.now(), session })
      await refreshPending()
      const last = await db.kv.get('lastSyncAt')
      if (last) set((s) => ({ sync: { ...s.sync, lastSyncAt: last.value as number } }))

      window.addEventListener('online', () => { if (get().user) void get().syncNow() })
      window.addEventListener('offline', () => set((s) => ({ sync: { ...s.sync, status: s.user ? 'offline' : 'local' } })))
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { get().tick(); if (get().user) void get().syncNow() } })
      setInterval(() => get().tick(), 30_000)
      setInterval(() => { if (get().user && navigator.onLine) void get().syncNow() }, 5 * 60_000)

      const c = supabase()
      if (c) {
        const { data } = await c.auth.getSession()
        const u = data.session?.user
        set({ user: u ? { id: u.id, email: u.email ?? '' } : null, authLoading: false })
        c.auth.onAuthStateChange((_evt, sess) => {
          const usr = sess?.user
          set({ user: usr ? { id: usr.id, email: usr.email ?? '' } : null })
          if (usr) setTimeout(() => void get().syncNow(), 0)
        })
        if (u) void get().syncNow()
      }
    },

    async refresh() { commit(await loadAll(db)); await refreshPending() },
    tick() { set({ now: Date.now() }) },
    say(msg) { set({ toast: msg }); setTimeout(() => { if (get().toast === msg) set({ toast: null }) }, 2800) },

    strategyFor(range) {
      const x = activeExperiment()
      if (!x) return undefined
      return armOfAyah(x, range.surah, range.start) ?? undefined
    },

    async logReview(input) {
      const x = activeExperiment()
      const session = get().session
      const strategy = x ? armOfAyah(x, input.range.surah, input.range.start) : undefined
      const e: ReviewEvent = { ...input, id: newId(), occurredAt: input.occurredAt ?? Date.now(), sessionId: session?.id, strategy, experimentId: strategy ? x?.id : undefined }
      await recordReview(db, e)
      commit({ ...get().snap, reviews: [...get().snap.reviews, e] })
      scheduleSync()
      return e
    },
    async logFlow(input) {
      const x = activeExperiment()
      const session = get().session
      const strategy = x ? armOfAyah(x, input.surah, input.ayah) : undefined
      const e: FlowEvent = { ...input, id: newId(), occurredAt: input.occurredAt ?? Date.now(), sessionId: session?.id, strategy, experimentId: strategy ? x?.id : undefined }
      await recordFlow(db, e)
      commit({ ...get().snap, flows: [...get().snap.flows, e] })
      scheduleSync()
      return e
    },
    async logPart(input) {
      const e: PartEvent = { ...input, id: newId(), occurredAt: input.occurredAt ?? Date.now(), sessionId: get().session?.id }
      await recordPart(db, e)
      commit({ ...get().snap, parts: [...get().snap.parts, e] })
      return e
    },
    async declare(range, level) {
      const e: Declaration = { id: newId(), range, level, occurredAt: Date.now() }
      await recordDeclaration(db, e)
      commit({ ...get().snap, declarations: [...get().snap.declarations, e] })
      scheduleSync()
    },
    async addTarget(range, label) {
      const now = Date.now()
      const t: LearningTarget = { id: newId(), range, status: 'active', createdAt: now, updatedAt: now, label }
      await saveTarget(db, t)
      commit({ ...get().snap, targets: [...get().snap.targets, t] })
      scheduleSync()
    },
    async setTargetStatus(id, status) {
      const cur = get().snap.targets.find((t) => t.id === id)
      if (!cur) return
      const t = { ...cur, status, updatedAt: Date.now() }
      await saveTarget(db, t)
      commit({ ...get().snap, targets: get().snap.targets.map((x) => (x.id === id ? t : x)) })
      scheduleSync()
    },
    async updateTarget(id, range, label) {
      const cur = get().snap.targets.find((t) => t.id === id)
      if (!cur) return
      const t: LearningTarget = { ...cur, range, label, updatedAt: Date.now() }
      await saveTarget(db, t)
      commit({ ...get().snap, targets: get().snap.targets.map((x) => (x.id === id ? t : x)) })
      scheduleSync()
    },
    async setMarker(surah, ayah, boundaries) {
      const m: PhraseMarker = { id: `${surah}:${ayah}`, surah, ayah, boundaries: [...new Set(boundaries)].sort((a, b) => a - b), source: 'user', updatedAt: Date.now() }
      await saveMarker(db, m)
      commit({ ...get().snap, markers: [...get().snap.markers.filter((x) => x.id !== m.id), m] })
      scheduleSync()
    },
    async patchSettings(p) {
      const s: Settings = { ...get().snap.settings, ...p, updatedAt: Date.now() }
      await saveSettings(db, s)
      applyTheme(s)
      commit({ ...get().snap, settings: s })
      scheduleSync()
    },

    plan() {
      const { snap, derived, now } = get()
      return computePlan(snap, derived, now)
    },
    async startSession(plan) {
      if (!plan.items.length) return null
      const now = Date.now()
      const s: ActiveSession = { id: newId(), startedAt: now, plan, queue: plan.items, index: 0, completed: [], skipped: [] }
      set({ session: s })
      persistSession(s)
      await saveSession(db, { id: s.id, startedAt: now, endedAt: null, plannedMinutes: Math.round(plan.budgetMinutes), planSnapshot: { items: plan.items.map((i) => ({ id: i.id, kind: i.kind, range: i.range, reasons: i.reasons })), notes: plan.notes, mode: plan.mode }, updatedAt: now })
      commit({ ...get().snap, sessions: await db.sessions.toArray().then((r) => r.map(({ synced, ...x }) => (void synced, x))) })
      scheduleSync()
      return s
    },
    completeItem(id, opts) {
      const s = get().session
      if (!s) return
      const next = { ...s, completed: [...s.completed, id], index: s.index + 1, ...(opts?.covered ? { covered: [...(s.covered ?? []), id] } : {}) }
      set({ session: next })
      persistSession(next)
    },
    skipItem(id) {
      const s = get().session
      if (!s) return
      const next = { ...s, skipped: [...s.skipped, id], index: s.index + 1 }
      set({ session: next })
      persistSession(next)
    },
    async endSession() {
      const s = get().session
      if (!s) return
      const now = Date.now()
      const row = { id: s.id, startedAt: s.startedAt, endedAt: now, plannedMinutes: Math.round(s.plan.budgetMinutes), planSnapshot: { items: s.plan.items.map((i) => ({ id: i.id, kind: i.kind, range: i.range, reasons: i.reasons })), notes: s.plan.notes, mode: s.plan.mode }, summary: { completed: s.completed, skipped: s.skipped, planned: s.queue.length, minutes: Math.round((now - s.startedAt) / 60000) }, updatedAt: now }
      await saveSession(db, row)
      set({ session: null })
      persistSession(null)
      commit({ ...get().snap, sessions: [...get().snap.sessions.filter((x) => x.id !== row.id), row] })
      scheduleSync()
    },

    async startExperiment() {
      const x = newExperiment(newId(), Date.now())
      await saveExperiment(db, x)
      commit({ ...get().snap, experiments: [...get().snap.experiments, x] })
      scheduleSync()
    },
    async stopExperiment() {
      const x = activeExperiment()
      if (!x) return
      const ended = { ...x, endsAt: Date.now(), updatedAt: Date.now() }
      await saveExperiment(db, ended)
      commit({ ...get().snap, experiments: get().snap.experiments.map((e) => (e.id === x.id ? ended : e)) })
      scheduleSync()
    },

    async syncNow() {
      const c = supabase()
      const user = get().user
      if (!c || !user) return
      if (!navigator.onLine) { set((s) => ({ sync: { ...s.sync, status: 'offline' } })); return }
      if (get().sync.status === 'syncing') return
      set((s) => ({ sync: { ...s.sync, status: 'syncing', error: null } }))
      try {
        const r = await syncOnce(db, supabaseRemote(c, user.id))
        const snap = await loadAll(db)
        set({ snap, derived: rebuild(snap), now: Date.now() })
        applyTheme(snap.settings)
        const pending = await pendingCount(db)
        set({ sync: { status: 'idle', pending, lastSyncAt: Date.now(), error: null, quarantined: r.quarantined } })
      } catch (e) {
        if (e instanceof OwnerMismatchError) set((s) => ({ sync: { ...s.sync, status: 'mismatch', error: e.message } }))
        else set((s) => ({ sync: { ...s.sync, status: navigator.onLine ? 'error' : 'offline', error: e instanceof Error ? e.message : 'Sync failed' } }))
      }
    },
    async signIn(email, password) {
      const c = supabase()
      if (!c) return 'Cloud sync is not configured for this build.'
      const { error } = await c.auth.signInWithPassword({ email, password })
      return error ? error.message : null
    },
    async signUp(email, password) {
      const c = supabase()
      if (!c) return 'Cloud sync is not configured for this build.'
      const { data, error } = await c.auth.signUp({ email, password, options: { emailRedirectTo: window.location.origin } })
      if (error) return error.message
      if (!data.session) return 'Check your email to confirm your address, then sign in.'
      return null
    },
    async signOut() {
      const c = supabase()
      if (c) await c.auth.signOut()
      set({ user: null, sync: { ...get().sync, status: 'local' } })
    },
    async exportJson() { return JSON.stringify(await exportBackup(db), null, 2) },
    async importJson(text) {
      try {
        const r = await importBackup(db, JSON.parse(text))
        await get().refresh()
        scheduleSync()
        return `Imported ${r.added} items (${r.skipped} already present).`
      } catch (e) {
        return e instanceof Error ? `That file isn’t a valid Hifz OS backup: ${e.message.slice(0, 160)}` : 'Invalid backup file.'
      }
    },
    async eraseLocal() {
      await clearLocalData(db)
      initDone = true
      set({ snap: EMPTY, derived: rebuild(EMPTY), session: null })
      persistSession(null)
      await refreshPending()
    },
    async eraseRemoteAndLocal() {
      const c = supabase()
      if (c && get().user) {
        const { error } = await c.rpc('erase_my_data')
        if (error) return error.message
      }
      await get().eraseLocal()
      return null
    },
  }
})

// Convenience for assigning an experiment arm when learning begins.
export async function ensureArm(range: Range): Promise<Strategy | undefined> {
  const st = useApp.getState()
  const x = st.snap.experiments.find((e) => isActive(e, Date.now()))
  if (!x) return undefined
  const existing = armOfAyah(x, range.surah, range.start)
  if (existing) return existing
  const arm = assignArm(x, range, corpus)
  const next = withAssignment(x, range, arm, Date.now())
  await saveExperiment(db, next)
  useApp.setState({ snap: { ...st.snap, experiments: st.snap.experiments.map((e) => (e.id === x.id ? next : e)) } })
  void rangeKey
  return arm
}
