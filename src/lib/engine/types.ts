// Core domain types. These are the shapes stored in the immutable event log,
// so changing them is a data migration, not a refactor.

export type Grade = 'independent' | 'hesitant' | 'prompted' | 'failed'
export type FlowRating = 'tangled' | 'improving' | 'natural'
export type StumbleKind = 'hesitated' | 'prompted' | 'wrong' | 'blank'

/** What kind of study the user was doing, as recorded when the event happened. */
export type PracticeContext = 'new' | 'sabqi' | 'manzil' | 'repair' | 'verify' | 'free' | 'probe'
export type Strategy = 'A' | 'B'

export interface AyahRef {
  surah: number
  ayah: number
}
export interface Range {
  surah: number
  start: number
  end: number
}
export interface Stumble {
  ayah: number
  kind: StumbleKind
}

/**
 * A recall attempt. Recitation from memory over `range`, graded as a whole, with
 * optional error markers. `cueLevel` says how much of the text was visible:
 * 4 = fully hidden (full evidence), 0 = fully visible (no recall evidence at all).
 */
export interface ReviewEvent {
  id: string
  /** 'recall' = passage/ayah recitation. 'junction' = transition drill between two ayahs. */
  kind: 'recall' | 'junction'
  range: Range
  grade: Grade
  context: PracticeContext
  cueLevel: 0 | 1 | 2 | 3 | 4
  stumbles: Stumble[]
  /** Ayahs k where the transition k -> k+1 felt shaky. */
  shakyJunctions: number[]
  /** Last ayah actually reached. Ayahs after it were not attempted and gain/lose nothing. */
  completedTo?: number
  durationMs: number
  occurredAt: number
  sessionId?: string
  strategy?: Strategy
  experimentId?: string
  /** Whether the user listened to the recitation first in this learning episode. */
  listenedFirst?: boolean
}

export interface FlowEvent {
  id: string
  surah: number
  ayah: number
  /** Phrase indices (inclusive) rehearsed in this rung of the ladder. */
  fromPhrase: number
  toPhrase: number
  phraseCount: number
  rating: FlowRating
  reps: number
  durationMs: number
  occurredAt: number
  sessionId?: string
  strategy?: Strategy
  experimentId?: string
  listenedFirst?: boolean
}

/** A user's statement about prior knowledge. Distinct from demonstrated recall. */
export interface Declaration {
  id: string
  range: Range
  /** 'known' = I already know this. 'retract' = I do not. */
  level: 'known' | 'retract'
  occurredAt: number
  note?: string
}

export interface LearningTarget {
  id: string
  range: Range
  status: 'active' | 'paused' | 'done'
  createdAt: number
  updatedAt: number
  label?: string
}

export interface PhraseMarker {
  id: string
  surah: number
  ayah: number
  /** Boundary i = a break after word i (0-based). */
  boundaries: number[]
  source: 'user'
  updatedAt: number
}

export interface Experiment {
  id: string
  name: string
  startedAt: number
  endsAt: number
  /** Strategy assignments per range key, fixed at the time of assignment. */
  assignments: Record<string, Strategy>
  updatedAt: number
}

export interface Settings {
  minutes: number
  theme: 'system' | 'light' | 'dark'
  reciter: string
  translation: boolean
  transliteration: boolean
  arabicScale: number
  showStreaks: boolean
  newPerDayCap: number
  /** Whether to propose a new-memorisation chunk at all. */
  planNew: boolean
  /** 'listen' plays the recitation; 'echo' leaves a silence for you to recite after each ayah. */
  practiceMode: 'listen' | 'echo'
  /** Silence after each ayah in echo mode, as a multiple of that ayah's own recording length. 0 = wait for a tap. */
  echoPause: 0 | 1 | 1.5 | 2
  repeatEach: number
  playbackRate: number
  /** Passages the user has saved for recitation practice (for example, for salah). */
  passages: SavedPassage[]
  updatedAt: number
}

export interface SavedPassage {
  id: string
  name: string
  range: Range
  createdAt: number
}

export const DEFAULT_SETTINGS: Settings = {
  minutes: 20,
  theme: 'system',
  reciter: 'alafasy',
  translation: true,
  transliteration: false,
  arabicScale: 1,
  showStreaks: false,
  newPerDayCap: 10,
  planNew: true,
  practiceMode: 'listen',
  echoPause: 1.5,
  repeatEach: 1,
  playbackRate: 1,
  passages: [],
  updatedAt: 0,
}

export const rangeKey = (r: Range) => `${r.surah}:${r.start}-${r.end}`
export const ayahKey = (surah: number, ayah: number) => `${surah}:${ayah}`
export const parseAyahKey = (k: string): AyahRef => {
  const [s, a] = k.split(':').map(Number)
  return { surah: s!, ayah: a! }
}
export const rangeLength = (r: Range) => r.end - r.start + 1

/** What the engine needs to know about the text, without importing it. */
export interface Corpus {
  ayahCount(surah: number): number
  wordCount(surah: number, ayah: number): number
}

export const DAY = 24 * 60 * 60 * 1000

export interface StudySession {
  id: string
  startedAt: number
  endedAt: number | null
  plannedMinutes: number
  /** The plan as it was shown, so "why was this chosen" survives later changes. */
  planSnapshot?: unknown
  summary?: unknown
  updatedAt: number
}
