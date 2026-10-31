// The daily planner. Deterministic and explainable: every item carries the facts
// it was chosen for, and the plan says what it left out and why. It uses only
// recorded history and fixed default parameters. It makes no claim of being
// personalised or scientifically validated.
import { ayahKey, DAY, type Corpus, type LearningTarget, type Range } from './types'
import { ayahStatus, type Derived } from './derive'
import { PARAMS, retrievability, dueAt, type AyahMemory } from './memory'

export type PlanKind = 'sabqi' | 'repair' | 'new' | 'manzil' | 'verify'

export interface PlanItem {
  id: string
  kind: PlanKind
  range: Range
  ayahs: number
  words: number
  estMinutes: number
  priority: number
  reasons: string[]
  title: string
}

export interface Plan {
  generatedAt: number
  budgetMinutes: number
  plannedMinutes: number
  mode: 'empty' | 'normal' | 'recovery'
  headline: string
  notes: string[]
  items: PlanItem[]
  backlog: { ayahs: number; minutes: number; items: number }
  deferred: { ayahs: number; items: number }
  upcoming: { next24h: number; next7d: number }
  modelNote: string
}

export interface PlannerInput {
  now: number
  derived: Derived
  corpus: Corpus
  targets: LearningTarget[]
  minutes: number
  planNew: boolean
  newPerDayCap: number
  /** Ayahs whose first accurate recall happened today (counts toward the daily cap). */
  learnedToday: number
  /** Median seconds-per-word to first accurate recall, if there is enough history. */
  learningSecPerWord: number | null
  lastSessionAt: number | null
  surahName?: (s: number) => string
}

const KIND_ORDER: PlanKind[] = ['sabqi', 'repair', 'new', 'manzil', 'verify']
const KIND_WEIGHT: Record<PlanKind, number> = { repair: 1.35, sabqi: 1.15, manzil: 1.0, verify: 0.35, new: 0 }
const MAX_WORDS: Record<PlanKind, number> = { sabqi: 80, repair: 70, manzil: 160, verify: 160, new: 0 }
const DEFAULT_SEC_PER_WORD = 10
const NEW_SHARE = 0.4

interface Cand {
  m: AyahMemory
  kind: PlanKind
  R: number
  risk: number
}

export function reviewMinutes(words: number, kind: PlanKind): number {
  const secs = (words / 1.8) * 1.35 + 15
  return (kind === 'repair' ? secs * 1.4 : secs) / 60
}
export function learningMinutes(words: number, secPerWord: number): number {
  return Math.max(1.5, (words * secPerWord) / 60 + 1)
}

export function agoText(from: number, now: number): string {
  const d = Math.floor((now - from) / DAY)
  if (d <= 0) return 'earlier today'
  if (d === 1) return 'yesterday'
  if (d < 14) return `${d} days ago`
  if (d < 60) return `${Math.round(d / 7)} weeks ago`
  return `${Math.round(d / 30)} months ago`
}

export function formatRange(r: Range, name?: (s: number) => string): string {
  const n = name ? name(r.surah) : `Surah ${r.surah}`
  return r.start === r.end ? `${n} ${r.start}` : `${n} ${r.start}–${r.end}`
}

export function buildPlan(input: PlannerInput): Plan {
  const { now, derived, corpus, targets } = input
  const B = Math.max(5, input.minutes)
  const name = input.surahName
  const sec = input.learningSecPerWord ?? DEFAULT_SEC_PER_WORD

  // ── 1. Candidates at ayah level ──────────────────────────────────────────
  const activeTargets = targets.filter((t) => t.status === 'active').sort((a, b) => a.createdAt - b.createdAt)
  const inTarget = (s: number, a: number) => activeTargets.some((t) => t.range.surah === s && a >= t.range.start && a <= t.range.end)
  const cands: Cand[] = []
  for (const [, m] of derived.memory) {
    const st = ayahStatus(m, derived.flow.get(ayahKey(m.surah, m.ayah)), now)
    if (st.stage === 'not_started') continue
    const R = st.retrievability
    let kind: PlanKind | null = null
    let risk = 1 - R
    if (st.stage === 'claimed') {
      kind = 'verify'
      risk = Math.min(0.5, (now - (m.claimedAt ?? now)) / DAY / 120)
    } else if (st.stage === 'learning') {
      if (!inTarget(m.surah, m.ayah)) kind = 'sabqi'
    } else if (st.stage === 'needs_repair') {
      kind = 'repair'
    } else if (R <= PARAMS.targetRetrievability) {
      const recent = m.firstDemonstratedAt !== null && now - m.firstDemonstratedAt < 14 * DAY
      kind = recent || m.stability < 8 ? 'sabqi' : 'manzil'
    }
    if (kind) cands.push({ m, kind, R, risk })
  }
  cands.sort((x, y) => x.m.surah - y.m.surah || x.m.ayah - y.m.ayah)

  // ── 2. Group adjacent ayahs of one kind into recitable passages ──────────
  type Run = { kind: PlanKind; surah: number; cands: Cand[]; words: number }
  const runs: Run[] = []
  for (const c of cands) {
    const last = runs[runs.length - 1]
    const w = corpus.wordCount(c.m.surah, c.m.ayah)
    const prev = last?.cands[last.cands.length - 1]
    if (last && prev && last.kind === c.kind && last.surah === c.m.surah && prev.m.ayah + 1 === c.m.ayah && last.words + w <= MAX_WORDS[c.kind]) {
      last.cands.push(c)
      last.words += w
    } else {
      runs.push({ kind: c.kind, surah: c.m.surah, cands: [c], words: w })
    }
  }

  const items: (PlanItem & { _score: number })[] = runs.map((r) => {
    const risks = r.cands.map((c) => c.risk)
    const mean = risks.reduce((a, b) => a + b, 0) / risks.length
    const max = Math.max(...risks)
    let shaky = 0
    for (let a = r.cands[0]!.m.ayah; a < r.cands[r.cands.length - 1]!.m.ayah; a++) {
      const j = derived.junctions.get(ayahKey(r.surah, a))
      if (j && j.shaky > j.ok) shaky++
    }
    const lapses = r.cands.reduce((n, c) => n + c.m.lapses, 0) / r.cands.length
    const score = (0.65 * mean + 0.35 * max + Math.min(0.3, shaky * 0.1) + Math.min(0.3, lapses * 0.1)) * KIND_WEIGHT[r.kind]
    const range: Range = { surah: r.surah, start: r.cands[0]!.m.ayah, end: r.cands[r.cands.length - 1]!.m.ayah }
    return {
      id: `${r.kind}:${r.surah}:${range.start}-${range.end}`,
      kind: r.kind,
      range,
      ayahs: r.cands.length,
      words: r.words,
      estMinutes: reviewMinutes(r.words, r.kind),
      priority: score,
      reasons: reasonsFor(r.cands, r.kind, derived, now),
      title: formatRange(range, name),
      _score: score,
    }
  })

  const due = items.filter((i) => i.kind !== 'verify')
  const backlogMinutes = due.reduce((n, i) => n + i.estMinutes, 0)
  const backlogAyahs = due.reduce((n, i) => n + i.ayahs, 0)

  // ── 3. Mode: normal, or recovery after a gap / large backlog ─────────────
  const hasHistory = derived.memory.size > 0 || derived.flow.size > 0
  const gapDays = input.lastSessionAt ? (now - input.lastSessionAt) / DAY : 0
  const recovery = hasHistory && ((gapDays >= 3 && backlogMinutes > B) || backlogMinutes > 2.5 * B)

  // ── 4. Budget split ──────────────────────────────────────────────────────
  const nextNew = input.planNew && !recovery ? nextNewChunk(activeTargets, derived, corpus, now, input.newPerDayCap - input.learnedToday, Infinity, sec, name) : null
  let newBudget = 0
  const notes: string[] = []
  if (nextNew && !recovery) {
    newBudget = NEW_SHARE * B
    const load = backlogMinutes / (0.6 * B)
    if (load > 1) {
      newBudget *= Math.max(0, 1 - (load - 1))
      notes.push(
        newBudget < 1
          ? 'Review workload is high, so no new memorisation is planned today. Protecting what you know comes first.'
          : 'Review workload is high, so today’s new memorisation has been reduced.',
      )
    }
  }
  let reviewBudget = B - newBudget

  // ── 5. Select reviews by priority, fitting the time budget ───────────────
  const ranked = due.sort((a, b) => b._score - a._score)
  const chosen: PlanItem[] = []
  let used = 0
  for (const it of ranked) {
    if (used + it.estMinutes <= reviewBudget || chosen.length === 0) {
      chosen.push(it)
      used += it.estMinutes
    }
  }
  const chosenIds = new Set(chosen.map((c) => c.id))
  const deferred = ranked.filter((i) => !chosenIds.has(i.id))

  // ── 6. Leftover time: extend new work, then verify unchecked claims ──────
  let leftover = Math.max(0, reviewBudget - used)
  if (nextNew && !recovery && leftover > 2) {
    const extra = Math.min(leftover * 0.6, Math.max(0, 0.55 * B - newBudget))
    newBudget += extra
    leftover -= extra
  }
  const verifyItems = items.filter((i) => i.kind === 'verify').sort((a, b) => b._score - a._score)
  const verifyChosen: PlanItem[] = []
  let verifyUsed = 0
  const verifyCap = Math.max(0.15 * B, leftover)
  for (const it of verifyItems) {
    if (verifyUsed + it.estMinutes <= Math.min(verifyCap, leftover + 0.15 * B)) {
      verifyChosen.push(it)
      verifyUsed += it.estMinutes
    }
  }

  // ── 7. The new-memorisation item, sized to its budget ────────────────────
  let newItem: PlanItem | null = null
  if (input.planNew && !recovery && newBudget >= 1) {
    const chunk = nextNewChunk(activeTargets, derived, corpus, now, input.newPerDayCap - input.learnedToday, newBudget, sec, name)
    if (chunk) {
      newItem = chunk
      if (reviewBudget < B - newBudget) reviewBudget = B - newBudget
    }
  }

  // ── 8. Assemble in a fixed, learnable order ──────────────────────────────
  const final = [...chosen, ...(newItem ? [newItem] : []), ...verifyChosen].sort(
    (a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) || b.priority - a.priority,
  )
  const planned = final.reduce((n, i) => n + i.estMinutes, 0)

  if (recovery) {
    const days = Math.max(2, Math.ceil(backlogMinutes / (B * 0.85)))
    notes.unshift(
      `Welcome back. ${backlogAyahs} ayahs are past their review time (about ${Math.round(backlogMinutes)} min in total). ` +
        `Instead of showing everything at once, today covers the highest-risk material; the rest is spread over roughly ${days} days. ` +
        'Nothing has been reset.' +
        (input.newPerDayCap > 0 ? ' New memorisation is paused until the backlog is under control.' : ''),
    )
  }
  if (deferred.length && !recovery) {
    notes.push(`${deferred.reduce((n, i) => n + i.ayahs, 0)} more ayahs are due but did not fit in ${B} minutes; they stay queued by risk.`)
  }

  const next24 = [...derived.memory.values()].filter((m) => m.firstDemonstratedAt !== null && dueAt(m) <= now + DAY).length
  const next7 = [...derived.memory.values()].filter((m) => m.firstDemonstratedAt !== null && dueAt(m) <= now + 7 * DAY).length

  const mode = !hasHistory && !final.length ? 'empty' : recovery ? 'recovery' : 'normal'
  return {
    generatedAt: now,
    budgetMinutes: B,
    plannedMinutes: planned,
    mode,
    headline: headline(mode, final, B, recovery),
    notes,
    items: final.map(({ ...rest }) => stripScore(rest)),
    backlog: { ayahs: backlogAyahs, minutes: backlogMinutes, items: due.length },
    deferred: { ayahs: deferred.reduce((n, i) => n + i.ayahs, 0), items: deferred.length },
    upcoming: { next24h: next24, next7d: next7 },
    modelNote: `Recall estimates come from a simple default forgetting model, tuned by hand, from ${derived.recallEventCount} recorded recall events. It is not yet personalised to you and has not been validated.`,
  }
}

function stripScore<T extends object>(x: T): PlanItem {
  const { _score, ...rest } = x as T & { _score?: number }
  void _score
  return rest as unknown as PlanItem
}

function headline(mode: Plan['mode'], items: PlanItem[], B: number, recovery: boolean): string {
  if (mode === 'empty') return 'Let’s start with what you already know'
  if (recovery) return 'A gentle return'
  if (!items.length) return 'Nothing is due right now'
  return `A ${B}-minute session`
}

function reasonsFor(cs: Cand[], kind: PlanKind, d: Derived, now: number): string[] {
  const out: string[] = []
  const ms = cs.map((c) => c.m)
  if (kind === 'verify') {
    const oldest = Math.min(...ms.map((m) => m.claimedAt ?? now))
    out.push(`You marked this as known ${agoText(oldest, now)}. It hasn’t been checked by recalling it here yet.`)
    return out
  }
  const successes = ms.map((m) => m.lastSuccessAt).filter((x): x is number => x !== null)
  if (successes.length) {
    const oldest = Math.min(...successes)
    out.push(`Last recalled successfully ${agoText(oldest, now)}.`)
  } else {
    out.push('Practised, but not yet recalled accurately on its own.')
  }
  const minR = Math.min(...cs.map((c) => c.R))
  out.push(`Estimated recall is about ${Math.round(minR * 100)}% at its weakest point.`)
  const prompted = cs.filter((c) => c.m.lastOutcome === 'prompted')
  if (prompted.length) out.push(`Needed prompting last time${prompted.length === 1 ? ` (ayah ${prompted[0]!.m.ayah})` : ` (${prompted.length} ayahs)`}.`)
  const lapsed = ms.filter((m) => m.lapses > 0)
  if (lapsed.length) out.push(`Previously forgotten ${Math.max(...lapsed.map((m) => m.lapses))} time(s).`)
  const failedLast = cs.filter((c) => c.m.lastOutcome === 'failed')
  if (failedLast.length) out.push(`Last attempt was not recalled (ayah ${failedLast[0]!.m.ayah}).`)
  const natural = cs.filter((c) => d.flow.get(ayahKey(c.m.surah, c.m.ayah))?.rating === 'natural')
  if (natural.length && minR < 0.75) out.push('Flow feels natural, but estimated recall has weakened.')
  const tangled = cs.filter((c) => d.flow.get(ayahKey(c.m.surah, c.m.ayah))?.rating === 'tangled')
  if (tangled.length) out.push('Flow is still marked tangled; rehearse aloud before recalling.')
  for (let a = cs[0]!.m.ayah; a < cs[cs.length - 1]!.m.ayah; a++) {
    const j = d.junctions.get(ayahKey(cs[0]!.m.surah, a))
    if (j && j.shaky > j.ok) {
      out.push(`The transition from ayah ${a} into ${a + 1} wobbled ${agoText(j.lastAt, now)}.`)
      break
    }
  }
  if (cs.length > 1 && !ms.some((m) => m.singleIndependents > 0)) out.push('Only checked as part of a longer passage so far.')
  return out
}

interface NewChunk extends PlanItem {}

/** The next stretch of an active goal that has no accurate independent recall yet. */
export function nextNewChunk(
  targets: LearningTarget[],
  d: Derived,
  corpus: Corpus,
  now: number,
  capLeft: number,
  budgetMinutes: number,
  secPerWord: number,
  name?: (s: number) => string,
): NewChunk | null {
  if (capLeft <= 0) return null
  for (const t of targets) {
    const { surah, start, end } = t.range
    let a = start
    const open = (x: number) => {
      const st = ayahStatus(d.memory.get(ayahKey(surah, x)), d.flow.get(ayahKey(surah, x)), now).stage
      return st === 'not_started' || st === 'learning'
    }
    while (a <= end && !open(a)) a++
    if (a > end) continue
    let b = a
    let words = corpus.wordCount(surah, a)
    let cost = learningMinutes(words, secPerWord)
    // Grow the chunk while it fits the budget and the daily cap.
    while (b + 1 <= end && open(b + 1) && b + 1 - a + 1 <= capLeft) {
      const w2 = words + corpus.wordCount(surah, b + 1)
      const c2 = learningMinutes(w2, secPerWord)
      if (c2 > budgetMinutes) break
      b++
      words = w2
      cost = c2
    }
    if (budgetMinutes !== Infinity && cost > budgetMinutes * 1.0 && budgetMinutes < 0.6 * cost && budgetMinutes < 3) return null
    const range: Range = { surah, start: a, end: b }
    const resumed = [...Array(b - a + 1)].some((_, i) => d.flow.has(ayahKey(surah, a + i)) || d.memory.has(ayahKey(surah, a + i)))
    const reasons = [
      `${resumed ? 'Continuing' : 'Next'} in your goal${t.label ? ` “${t.label}”` : ''}: ${formatRange(t.range, name)}.`,
    ]
    if (cost > budgetMinutes) reasons.push(`This is a long passage (${words} words); it may take more than one session, and your progress is kept ladder by ladder.`)
    return {
      id: `new:${surah}:${a}-${b}`,
      kind: 'new',
      range,
      ayahs: b - a + 1,
      words,
      estMinutes: cost,
      priority: 1,
      reasons,
      title: formatRange(range, name),
    }
  }
  return null
}

export { retrievability }
