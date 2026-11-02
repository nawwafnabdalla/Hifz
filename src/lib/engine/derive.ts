// Derives all learning state from the immutable event log. Nothing here is
// persisted: delete the derived state and it is rebuilt identically from events.
import { applyClaim, applyEvidence, applyRetract, newMemory, retrievability, PARAMS, type AyahMemory } from './memory'
import { attribute } from './attribution'
import { ayahKey, DAY, type Corpus, type Declaration, type FlowEvent, type FlowRating, type Grade, type PartEvent, type ReviewEvent } from './types'

export interface JunctionState {
  surah: number
  from: number
  ok: number
  shaky: number
  lastAt: number
  lastOk: boolean | null
}
/** True while a transition between two ayahs has gone worse than it has gone well, and has not just been fixed. */
export function junctionNeedsRepair(j: JunctionState): boolean {
  const trouble = j.shaky - 0.5 * j.ok
  return trouble > 0 && (j.lastOk === false || trouble > 0.5)
}

export interface FlowState {
  surah: number
  ayah: number
  rating: FlowRating
  lastAt: number
  events: number
  totalMs: number
}
export interface Derived {
  memory: Map<string, AyahMemory>
  junctions: Map<string, JunctionState>
  flow: Map<string, FlowState>
  /** Part-of-ayah recalls per ayah, oldest first. Evidence of where a learner is in a long ayah; it never feeds `memory`. */
  parts: Map<string, PartEvent[]>
  lastActivityAt: number | null
  recallEventCount: number
}
export interface EventLog {
  reviews: ReviewEvent[]
  flows: FlowEvent[]
  parts?: PartEvent[]
  declarations: Declaration[]
}

type Tagged =
  | { t: 'review'; at: number; id: string; e: ReviewEvent }
  | { t: 'decl'; at: number; id: string; e: Declaration }

export function deriveState(log: EventLog): Derived {
  const memory = new Map<string, AyahMemory>()
  const junctions = new Map<string, JunctionState>()
  const flow = new Map<string, FlowState>()
  const get = (s: number, a: number) => memory.get(ayahKey(s, a)) ?? newMemory(s, a)

  const timeline: Tagged[] = [
    ...log.reviews.map((e) => ({ t: 'review' as const, at: e.occurredAt, id: e.id, e })),
    ...log.declarations.map((e) => ({ t: 'decl' as const, at: e.occurredAt, id: e.id, e })),
  ].sort((x, y) => x.at - y.at || (x.id < y.id ? -1 : 1))

  let lastActivityAt: number | null = null
  let recallEventCount = 0
  for (const item of timeline) {
    if (item.t === 'decl') {
      const { surah, start, end } = item.e.range
      for (let a = start; a <= end; a++) {
        memory.set(ayahKey(surah, a), item.e.level === 'known' ? applyClaim(get(surah, a), item.at) : applyRetract(get(surah, a)))
      }
      continue
    }
    const attr = attribute(item.e)
    if (attr.ayahs.length || attr.junctions.length) recallEventCount++
    lastActivityAt = Math.max(lastActivityAt ?? 0, item.at)
    for (const ev of attr.ayahs) memory.set(ayahKey(ev.surah, ev.ayah), applyEvidence(get(ev.surah, ev.ayah), ev))
    for (const j of attr.junctions) {
      const k = ayahKey(j.surah, j.from)
      const cur = junctions.get(k) ?? { surah: j.surah, from: j.from, ok: 0, shaky: 0, lastAt: 0, lastOk: null }
      junctions.set(k, {
        ...cur,
        ok: cur.ok + (j.ok ? j.weight : 0),
        shaky: cur.shaky + (j.ok ? 0 : j.weight),
        lastAt: j.at,
        lastOk: j.ok,
      })
    }
  }

  const flowEvents = [...log.flows].sort((x, y) => x.occurredAt - y.occurredAt)
  for (const f of flowEvents) {
    const k = ayahKey(f.surah, f.ayah)
    const cur = flow.get(k)
    // The rating of the most recent rung that spans the whole ayah wins; otherwise the latest event.
    const wholeAyah = f.fromPhrase === 0 && f.toPhrase === f.phraseCount - 1
    const rating = wholeAyah || !cur ? f.rating : worst(cur.rating, f.rating, f.occurredAt, cur.lastAt)
    flow.set(k, { surah: f.surah, ayah: f.ayah, rating, lastAt: f.occurredAt, events: (cur?.events ?? 0) + 1, totalMs: (cur?.totalMs ?? 0) + f.durationMs })
    lastActivityAt = Math.max(lastActivityAt ?? 0, f.occurredAt)
  }
  const parts = new Map<string, PartEvent[]>()
  for (const p of [...(log.parts ?? [])].sort((x, y) => x.occurredAt - y.occurredAt || (x.id < y.id ? -1 : 1))) {
    const k = ayahKey(p.surah, p.ayah)
    parts.set(k, [...(parts.get(k) ?? []), p])
    lastActivityAt = Math.max(lastActivityAt ?? 0, p.occurredAt)
  }
  return { memory, junctions, flow, parts, lastActivityAt, recallEventCount }
}

const ORDER: FlowRating[] = ['tangled', 'improving', 'natural']
function worst(prev: FlowRating, next: FlowRating, _nt: number, _pt: number): FlowRating {
  // A newer partial-rung rating can lower the ayah's flow (a tangled junction) but only ever raises it one step.
  const pi = ORDER.indexOf(prev)
  const ni = ORDER.indexOf(next)
  return ni < pi ? next : ORDER[Math.min(pi + 1, ni)]!
}

// ── Stage classification (what the knowledge map shows) ───────────────────

export type Stage = 'not_started' | 'learning' | 'claimed' | 'reviewing' | 'needs_repair' | 'strong'
export const STAGE_LABEL: Record<Stage, string> = {
  not_started: 'Not started',
  learning: 'Learning',
  claimed: 'Marked known, not yet verified',
  reviewing: 'Reviewing',
  needs_repair: 'Needs repair',
  strong: 'Strongly retained',
}

export interface AyahStatus {
  stage: Stage
  retrievability: number
  /** Why the stage is what it is, in plain language. */
  because: string
  /** True when the material is past its scheduled review time. */
  overdue: boolean
  verifiedIndividually: boolean
  demonstrated: boolean
}

export function ayahStatus(m: AyahMemory | undefined, flow: FlowState | undefined, now: number): AyahStatus {
  if (!m || (m.stability <= 0 && !flow && m.reviews === 0)) {
    return { stage: 'not_started', retrievability: 0, because: 'No practice or declaration recorded.', overdue: false, verifiedIndividually: false, demonstrated: false }
  }
  const R = retrievability(m, now)
  const demonstrated = m.firstDemonstratedAt !== null
  const verifiedIndividually = m.singleIndependents > 0
  const overdue = demonstrated && R < PARAMS.targetRetrievability

  const recentLapse = m.lastLapseAt !== null && now - m.lastLapseAt < 14 * DAY
  const weakLast =
    (m.lastOutcome === 'failed' || m.lastOutcome === 'prompted') && m.lastOutcomeWeight >= 0.5
  if (demonstrated && (weakLast || recentLapse)) {
    return { stage: 'needs_repair', retrievability: R, because: weakLast ? `Last attempt: ${labelGrade(m.lastOutcome!)}.` : 'Forgotten recently.', overdue, verifiedIndividually, demonstrated }
  }
  if (!demonstrated) {
    if (m.claimed) return { stage: 'claimed', retrievability: R, because: 'You marked this as known. It has not been checked by recall here yet.', overdue: false, verifiedIndividually: false, demonstrated: false }
    const hadWeak = m.lastOutcome === 'failed' || m.lastOutcome === 'prompted' || m.reviews > 0
    return { stage: 'learning', retrievability: R, because: hadWeak ? 'Practised, but no accurate independent recall yet.' : 'Flow practice started; not yet recalled from memory.', overdue: false, verifiedIndividually: false, demonstrated: false }
  }
  if (m.independents >= 3 && m.stability >= 45 && R >= 0.8) {
    return { stage: 'strong', retrievability: R, because: `Stable (about ${Math.round(m.stability)} days) and recalled independently ${Math.round(m.independents)} times.`, overdue, verifiedIndividually, demonstrated }
  }
  return { stage: 'reviewing', retrievability: R, because: overdue ? 'Due for review.' : 'On schedule.', overdue, verifiedIndividually, demonstrated }
}

export function labelGrade(g: Grade): string {
  return { independent: 'recalled independently', hesitant: 'recalled with hesitation', prompted: 'needed prompting', failed: 'not recalled' }[g]
}

export interface SurahSummary {
  surah: number
  total: number
  counts: Record<Stage, number>
  verifiedRecently: number
  dueNow: number
  meanRetrievability: number
}

export function summariseSurah(surah: number, corpus: Corpus, d: Derived, now: number): SurahSummary {
  const total = corpus.ayahCount(surah)
  const counts: Record<Stage, number> = { not_started: 0, learning: 0, claimed: 0, reviewing: 0, needs_repair: 0, strong: 0 }
  let verifiedRecently = 0
  let dueNow = 0
  let rSum = 0
  let rN = 0
  for (let a = 1; a <= total; a++) {
    const m = d.memory.get(ayahKey(surah, a))
    const st = ayahStatus(m, d.flow.get(ayahKey(surah, a)), now)
    counts[st.stage]++
    if (m?.lastSuccessAt && now - m.lastSuccessAt < 7 * DAY) verifiedRecently++
    if (st.overdue || st.stage === 'needs_repair') dueNow++
    if (st.demonstrated) { rSum += st.retrievability; rN++ }
  }
  return { surah, total, counts, verifiedRecently, dueNow, meanRetrievability: rN ? rSum / rN : 0 }
}
