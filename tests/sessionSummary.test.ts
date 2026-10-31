import { describe, expect, it } from 'vitest'
import { dueLabel, summariseSession } from '@/lib/sessionSummary'
import { deriveState } from '@/lib/engine/derive'
import type { PlanItem } from '@/lib/engine/planner'
import { DAY } from '@/lib/engine/types'
import { daysAgo, NOW, review } from './helpers'

const item = (id: string, kind: PlanItem['kind'], s: number, a: number, b: number, drill?: 'junction'): PlanItem => ({ id, kind, range: { surah: s, start: a, end: b }, ayahs: b - a + 1, words: 10, estMinutes: 1, priority: 1, reasons: [], title: id, drill })
const sum = (queue: PlanItem[], completed: string[], skipped: string[], rs: ReturnType<typeof review>[]) => summariseSession({
  sessionId: 'S1', queue, completed, skipped, startedAt: NOW - 20 * 60000, reviews: rs, flows: [], derived: deriveState({ reviews: rs, flows: [], declarations: [] }), now: NOW,
})
const ev = (r: [number, number, number], g: Parameters<typeof review>[1], extra = {}) => review(r, g, NOW - 5 * 60000, { sessionId: 'S1', ...extra })

describe('end-of-session summary', () => {
  it('describes each item by what was actually recorded, with no invented scores', () => {
    const q = [item('a', 'sabqi', 20, 1, 2), item('b', 'new', 20, 3, 3), item('c', 'repair', 20, 9, 9), item('d', 'manzil', 2, 1, 5)]
    const s = sum(q, ['a', 'b', 'c'], ['d'], [ev([20, 1, 2], 'independent'), ev([20, 3, 3], 'independent', { context: 'new' }), ev([20, 9, 9], 'prompted')])
    const by = Object.fromEntries(s.items.map((i) => [i.id, i]))
    expect(by.a!.result).toBe('smooth')
    expect(by.b!.result).toBe('learned')
    expect(by.c!.result).toBe('difficult')
    expect(by.d!.result).toBe('skipped')
    expect(s.needsAttention.map((n) => n.text).join(' ')).toMatch(/20:9/)
    expect(s.recalls).toBe(3)
  })
  it('hesitation is "mixed", not success and not failure', () => {
    expect(sum([item('a', 'sabqi', 20, 1, 1)], ['a'], [], [ev([20, 1, 1], 'hesitant')]).items[0]!.result).toBe('mixed')
  })
  it('says when hints lowered the evidence', () => {
    const s = sum([item('a', 'sabqi', 20, 1, 1)], ['a'], [], [ev([20, 1, 1], 'hesitant', { cueLevel: 3 })])
    expect(s.items[0]!.note).toMatch(/Hints were used/)
  })
  it('ignores events from other sessions', () => {
    const other = review([20, 1, 1], 'failed', NOW - 60000, { sessionId: 'OTHER' })
    expect(sum([item('a', 'sabqi', 20, 1, 1)], ['a'], [], [other]).items[0]!.result).toBe('practised')
  })
  it('reports the next review time from the derived schedule', () => {
    const s = sum([item('a', 'sabqi', 20, 1, 1)], ['a'], [], [ev([20, 1, 1], 'independent')])
    const at = s.items[0]!.nextReviewAt!
    expect(at).toBeGreaterThan(NOW)
    expect(at - NOW).toBeLessThan(2 * DAY)
  })
  it('flags a transition that is still shaky', () => {
    const rs = [review([20, 12, 13], 'failed', daysAgo(1), { kind: 'junction' }), review([20, 12, 13], 'failed', NOW - 4 * 60000, { kind: 'junction', sessionId: 'S1' })]
    const s = sum([item('j', 'repair', 20, 12, 13, 'junction')], ['j'], [], rs)
    expect(s.needsAttention.map((n) => n.text).join(' ')).toMatch(/20:12 into 13/)
  })
  it('labels due times in plain words', () => {
    expect(dueLabel(NOW + 3600e3, NOW)).toBe('later today')
    expect(dueLabel(NOW + 26 * 3600e3, NOW)).toBe('tomorrow')
    expect(dueLabel(NOW + 5 * DAY, NOW)).toBe('in 5 days')
    expect(dueLabel(NOW - 1, NOW)).toBe('now')
  })
})
