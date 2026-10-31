// Runtime validation for anything that enters from outside: backups, and rows pulled from the server.
import { z } from 'zod'

const surah = z.number().int().min(1).max(114)
const ayah = z.number().int().min(1).max(286)
const ms = z.number().int().min(0).max(4_102_444_800_000)
const grade = z.enum(['independent', 'hesitant', 'prompted', 'failed'])
const range = z.object({ surah, start: ayah, end: ayah })

export const reviewEventSchema = z.object({
  id: z.string().uuid(),
  kind: z.enum(['recall', 'junction']),
  range,
  grade,
  context: z.enum(['new', 'sabqi', 'manzil', 'repair', 'verify', 'free', 'probe']),
  cueLevel: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
  stumbles: z.array(z.object({ ayah, kind: z.enum(['hesitated', 'prompted', 'wrong', 'blank']) })).max(300),
  shakyJunctions: z.array(ayah).max(300),
  completedTo: ayah.optional(),
  durationMs: z.number().int().min(0).max(86_400_000),
  occurredAt: ms,
  sessionId: z.string().uuid().optional(),
  strategy: z.enum(['A', 'B']).optional(),
  experimentId: z.string().uuid().optional(),
  listenedFirst: z.boolean().optional(),
}).refine((e) => e.range.end >= e.range.start, 'range end before start')

export const flowEventSchema = z.object({
  id: z.string().uuid(),
  surah, ayah,
  fromPhrase: z.number().int().min(0).max(300),
  toPhrase: z.number().int().min(0).max(300),
  phraseCount: z.number().int().min(1).max(300),
  rating: z.enum(['tangled', 'improving', 'natural']),
  reps: z.number().int().min(0).max(1000),
  durationMs: z.number().int().min(0).max(86_400_000),
  occurredAt: ms,
  sessionId: z.string().uuid().optional(),
  strategy: z.enum(['A', 'B']).optional(),
  experimentId: z.string().uuid().optional(),
  listenedFirst: z.boolean().optional(),
}).refine((e) => e.toPhrase >= e.fromPhrase && e.toPhrase < e.phraseCount, 'bad phrase range')

export const declarationSchema = z.object({
  id: z.string().uuid(),
  range,
  level: z.enum(['known', 'retract']),
  occurredAt: ms,
  note: z.string().max(500).optional(),
})

export const sessionSchema = z.object({
  id: z.string().uuid(),
  startedAt: ms,
  endedAt: ms.nullable(),
  plannedMinutes: z.number().int().min(1).max(600),
  planSnapshot: z.unknown().optional(),
  summary: z.unknown().optional(),
  updatedAt: ms,
})

export const targetSchema = z.object({
  id: z.string().uuid(),
  range,
  status: z.enum(['active', 'paused', 'done']),
  createdAt: ms,
  updatedAt: ms,
  label: z.string().max(120).optional(),
})

export const markerSchema = z.object({
  id: z.string().regex(/^\d{1,3}:\d{1,3}$/),
  surah, ayah,
  boundaries: z.array(z.number().int().min(0).max(300)).max(200),
  source: z.literal('user'),
  updatedAt: ms,
})

export const experimentSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(120),
  startedAt: ms,
  endsAt: ms,
  assignments: z.record(z.string(), z.enum(['A', 'B'])),
  updatedAt: ms,
})

export const settingsSchema = z.object({
  minutes: z.number().min(5).max(240),
  theme: z.enum(['system', 'light', 'dark']),
  reciter: z.string().max(60),
  translation: z.boolean(),
  transliteration: z.boolean(),
  arabicScale: z.number().min(0.8).max(1.8),
  showStreaks: z.boolean(),
  newPerDayCap: z.number().int().min(0).max(60),
  planNew: z.boolean(),
  practiceMode: z.enum(['listen', 'echo']),
  echoPause: z.union([z.literal(0), z.literal(1), z.literal(1.5), z.literal(2)]),
  repeatEach: z.number().int().min(1).max(20),
  playbackRate: z.number().min(0.5).max(2),
  passages: z.array(z.object({ id: z.string().uuid(), name: z.string().min(1).max(60), range, createdAt: ms })).max(30),
  updatedAt: ms,
}).partial().required({ updatedAt: true })

export const backupSchema = z.object({
  app: z.literal('hifz-os'),
  schema: z.literal(1),
  exportedAt: z.string(),
  reviews: z.array(reviewEventSchema),
  flows: z.array(flowEventSchema),
  declarations: z.array(declarationSchema),
  sessions: z.array(sessionSchema).default([]),
  targets: z.array(targetSchema).default([]),
  markers: z.array(markerSchema).default([]),
  experiments: z.array(experimentSchema).default([]),
  settings: settingsSchema.optional(),
})
export type Backup = z.infer<typeof backupSchema>
