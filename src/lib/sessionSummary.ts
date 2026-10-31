// What a finished session tells the user, derived only from events recorded during it.
// No scores, no streaks, no praise inflation: what was practised, how each item went, what is scheduled, what needs attention.
import { dueAt } from '@/lib/engine/memory'
import { junctionNeedsRepair, type Derived } from '@/lib/engine/derive'
import type { PlanItem } from '@/lib/engine/planner'
import { ayahKey, DAY, type FlowEvent, type ReviewEvent } from '@/lib/engine/types'

export type Result = 'smooth' | 'mixed' | 'difficult' | 'learned' | 'practised' | 'skipped'
export interface ItemOutcome {
  id: string
  kind: PlanItem['kind']
  range: PlanItem['range']
  drill?: PlanItem['drill']
  result: Result
  /** One plain sentence about how it went. */
  note: string
  /** Earliest scheduled review among this item's recalled ayahs, or null if none is scheduled yet. */
  nextReviewAt: number | null
}
export interface SessionSummary {
  items: ItemOutcome[]
  recalls: number
  minutes: number
  needsAttention: { text: string }[]
}

const overlaps = (a: PlanItem['range'], b: { surah: number; start: number; end: number }) => a.surah === b.surah && a.start <= b.end && b.start <= a.end

export function dueLabel(at: number, now: number): string {
  const d = at - now
  if (d <= 0) return 'now'
  if (d < 18 * 3600 * 1000) return 'later today'
  if (d < 2 * DAY) return 'tomorrow'
  return `in ${Math.round(d / DAY)} days`
}

export function summariseSession(opts: {
  sessionId: string; queue: PlanItem[]; completed: string[]; skipped: string[]; startedAt: number
  reviews: ReviewEvent[]; flows: FlowEvent[]; derived: Derived; now: number
}): SessionSummary {
  const { sessionId, queue, completed, skipped, reviews, flows, derived, now } = opts
  const mine = reviews.filter((r) => r.sessionId === sessionId)
  const myFlows = flows.filter((f) => f.sessionId === sessionId)
  const items: ItemOutcome[] = []
  const needsAttention: { text: string }[] = []

  for (const q of queue) {
    if (skipped.includes(q.id) || !completed.includes(q.id)) {
      items.push({ id: q.id, kind: q.kind, range: q.range, drill: q.drill, result: 'skipped', note: 'Skipped. It stays in your queue.', nextReviewAt: null })
      continue
    }
    const evs = mine.filter((r) => overlaps(q.range, r.range) && (q.drill ? r.kind === 'junction' : r.kind === 'recall'))
    const grades = evs.map((e) => e.grade)
    const flowN = myFlows.filter((f) => overlaps(q.range, { surah: f.surah, start: f.ayah, end: f.ayah })).length
    let result: Result
    let note: string
    if (!grades.length) { result = 'practised'; note = flowN ? 'Flow practised; no recall recorded.' : 'Completed.' }
    else if (grades.some((g) => g === 'failed' || g === 'prompted')) { result = 'difficult'; note = grades.includes('failed') ? 'Not recalled yet. It will come back soon.' : 'Needed prompting. It will come back soon.' }
    else if (grades.every((g) => g === 'independent')) { result = q.kind === 'new' ? 'learned' : 'smooth'; note = q.kind === 'new' ? 'Recalled on your own after learning.' : 'Recalled on your own.' }
    else { result = 'mixed'; note = 'Accurate, with some hesitation.' }
    if (evs.some((e) => e.cueLevel < 4)) note += ' Hints were used, which counts as weaker evidence.'

    let next: number | null = null
    for (let a = q.range.start; a <= q.range.end; a++) {
      const m = derived.memory.get(ayahKey(q.range.surah, a))
      if (m && m.firstDemonstratedAt !== null) { const d = dueAt(m); next = next === null ? d : Math.min(next, d) }
    }
    items.push({ id: q.id, kind: q.kind, range: q.range, drill: q.drill, result, note, nextReviewAt: next })
    if (result === 'difficult') needsAttention.push({ text: `${q.range.surah}:${q.range.start}${q.range.end > q.range.start ? `–${q.range.end}` : ''}: ${note}` })
  }

  for (const f of myFlows) if (f.rating === 'tangled' && f.reps === 0) needsAttention.push({ text: `${f.surah}:${f.ayah}: a spot you slipped on is marked for practice.` })
  for (const j of derived.junctions.values()) {
    if (junctionNeedsRepair(j) && mine.some((r) => r.range.surah === j.surah && r.range.start <= j.from && r.range.end >= j.from + 1)) needsAttention.push({ text: `${j.surah}:${j.from} into ${j.from + 1}: the transition is still shaky.` })
  }
  const uniq = [...new Map(needsAttention.map((n) => [n.text, n])).values()]
  const minutes = Math.max(1, Math.round((now - opts.startedAt) / 60000))
  return { items, recalls: mine.length, minutes, needsAttention: uniq }
}
