// Local-first persistence (IndexedDB via Dexie). Every write lands here first,
// with synced=0, and is pushed to the server later. Event tables are append-only
// by convention: there is no update path for them in this codebase.
import Dexie, { type Table } from 'dexie'
import type { Declaration, Experiment, FlowEvent, LearningTarget, PhraseMarker, ReviewEvent, Settings, StudySession } from '@/lib/engine/types'

export type Stored<T> = T & { synced: 0 | 1 }
export interface KV { key: string; value: unknown }

export class HifzDB extends Dexie {
  reviews!: Table<Stored<ReviewEvent>, string>
  flows!: Table<Stored<FlowEvent>, string>
  declarations!: Table<Stored<Declaration>, string>
  sessions!: Table<Stored<StudySession>, string>
  targets!: Table<Stored<LearningTarget>, string>
  markers!: Table<Stored<PhraseMarker>, string>
  experiments!: Table<Stored<Experiment>, string>
  kv!: Table<KV, string>

  constructor(name = 'hifz-os') {
    super(name)
    this.version(1).stores({
      reviews: 'id, occurredAt, synced',
      flows: 'id, occurredAt, synced',
      declarations: 'id, occurredAt, synced',
      sessions: 'id, startedAt, synced',
      targets: 'id, synced',
      markers: 'id, synced',
      experiments: 'id, synced',
      kv: 'key',
    })
  }
}

export type TableKey = 'reviews' | 'flows' | 'declarations' | 'sessions' | 'targets' | 'markers' | 'experiments'
export const TABLE_KEYS: TableKey[] = ['reviews', 'flows', 'declarations', 'sessions', 'targets', 'markers', 'experiments']

export interface StoredSettings { value: Settings; synced: 0 | 1 }

export const newId = (): string => crypto.randomUUID()
