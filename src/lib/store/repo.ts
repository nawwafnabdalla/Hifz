// Thin, validated access to the local database. Event tables are add-only:
// `add` (not `put`) is used, so an existing id can never be overwritten.
import type { HifzDB, Stored } from './db'
import {
  backupSchema, declarationSchema, experimentSchema, flowEventSchema, markerSchema, partEventSchema, reviewEventSchema, sessionSchema, settingsSchema, targetSchema, type Backup,
} from './schemas'
import { DEFAULT_SETTINGS, type Declaration, type Experiment, type FlowEvent, type LearningTarget, type PartEvent, type PhraseMarker, type ReviewEvent, type Settings, type StudySession } from '@/lib/engine/types'

const strip = <T extends { synced: 0 | 1 }>(r: T): Omit<T, 'synced'> => {
  const { synced, ...rest } = r
  void synced
  return rest
}

export interface Snapshot {
  reviews: ReviewEvent[]
  flows: FlowEvent[]
  parts: PartEvent[]
  declarations: Declaration[]
  sessions: StudySession[]
  targets: LearningTarget[]
  markers: PhraseMarker[]
  experiments: Experiment[]
  settings: Settings
}

export async function loadAll(db: HifzDB): Promise<Snapshot> {
  const [reviews, flows, parts, declarations, sessions, targets, markers, experiments, st] = await Promise.all([
    db.reviews.toArray(), db.flows.toArray(), db.parts.toArray(), db.declarations.toArray(), db.sessions.toArray(), db.targets.toArray(),
    db.markers.toArray(), db.experiments.toArray(), db.kv.get('settings'),
  ])
  const stored = st?.value as { value: Settings } | undefined
  return {
    reviews: reviews.map(strip) as ReviewEvent[],
    flows: flows.map(strip) as FlowEvent[],
    parts: parts.map(strip) as PartEvent[],
    declarations: declarations.map(strip) as Declaration[],
    sessions: sessions.map(strip) as StudySession[],
    targets: targets.map(strip) as LearningTarget[],
    markers: markers.map(strip) as PhraseMarker[],
    experiments: experiments.map(strip) as Experiment[],
    settings: { ...DEFAULT_SETTINGS, ...(stored?.value ?? {}) },
  }
}

export const recordReview = async (db: HifzDB, e: ReviewEvent) => { reviewEventSchema.parse(e); await db.reviews.add({ ...e, synced: 0 }) }
export const recordFlow = async (db: HifzDB, e: FlowEvent) => { flowEventSchema.parse(e); await db.flows.add({ ...e, synced: 0 }) }
export const recordPart = async (db: HifzDB, e: PartEvent) => { partEventSchema.parse(e); await db.parts.add({ ...e, synced: 0 }) }
export const recordDeclaration = async (db: HifzDB, e: Declaration) => { declarationSchema.parse(e); await db.declarations.add({ ...e, synced: 0 }) }

export const saveSession = async (db: HifzDB, s: StudySession) => { sessionSchema.parse(s); await db.sessions.put({ ...s, synced: 0 }) }
export const saveTarget = async (db: HifzDB, t: LearningTarget) => { targetSchema.parse(t); await db.targets.put({ ...t, synced: 0 }) }
export const saveMarker = async (db: HifzDB, m: PhraseMarker) => { markerSchema.parse(m); await db.markers.put({ ...m, synced: 0 }) }
export const saveExperiment = async (db: HifzDB, x: Experiment) => { experimentSchema.parse(x); await db.experiments.put({ ...x, synced: 0 }) }
export async function saveSettings(db: HifzDB, s: Settings) {
  settingsSchema.parse(s)
  await db.kv.put({ key: 'settings', value: { value: s, synced: 0 } })
}

export async function exportBackup(db: HifzDB): Promise<Backup> {
  const s = await loadAll(db)
  return { app: 'hifz-os', schema: 1, exportedAt: new Date().toISOString(), ...s, settings: s.settings }
}

export interface ImportSummary { added: number; skipped: number }

/** Restore from a backup. Events already present (same id) are skipped, never overwritten. */
export async function importBackup(db: HifzDB, json: unknown): Promise<ImportSummary> {
  const b = backupSchema.parse(json)
  let added = 0
  let skipped = 0
  const addAll = async <T extends { id: string }>(table: { bulkAdd(r: Stored<T>[], o: { allKeys: true }): Promise<unknown> } & { get(id: string): Promise<unknown> }, rows: T[]) => {
    for (const r of rows) {
      if (await table.get(r.id)) { skipped++; continue }
      await (table as any).add({ ...r, synced: 0 })
      added++
    }
  }
  await addAll(db.reviews as never, b.reviews)
  await addAll(db.flows as never, b.flows)
  await addAll(db.parts as never, b.parts)
  await addAll(db.declarations as never, b.declarations)
  for (const s of b.sessions) { if (!(await db.sessions.get(s.id))) { await db.sessions.add({ ...s, synced: 0 }); added++ } else skipped++ }
  for (const t of b.targets) { if (!(await db.targets.get(t.id))) { await db.targets.add({ ...t, synced: 0 }); added++ } else skipped++ }
  for (const m of b.markers) { if (!(await db.markers.get(m.id))) { await db.markers.add({ ...m, synced: 0 }); added++ } else skipped++ }
  for (const x of b.experiments) { if (!(await db.experiments.get(x.id))) { await db.experiments.add({ ...x, synced: 0 }); added++ } else skipped++ }
  return { added, skipped }
}

export async function clearLocalData(db: HifzDB) {
  await Promise.all([db.reviews.clear(), db.flows.clear(), db.parts.clear(), db.declarations.clear(), db.sessions.clear(), db.targets.clear(), db.markers.clear(), db.experiments.clear(), db.kv.clear()])
}
