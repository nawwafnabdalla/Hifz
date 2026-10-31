import { describe, expect, it } from 'vitest'
import { ayahStatus, deriveState } from '@/lib/engine/derive'
import { ayahKey, DAY } from '@/lib/engine/types'
import { claim, daysAgo, NOW, review } from './helpers'

const st = (log: Parameters<typeof deriveState>[0], s: number, a: number, now = NOW) => {
  const d = deriveState(log)
  return ayahStatus(d.memory.get(ayahKey(s, a)), d.flow.get(ayahKey(s, a)), now)
}
const log = (over: Partial<Parameters<typeof deriveState>[0]> = {}) => ({ reviews: [], flows: [], declarations: [], ...over })

describe('derived state', () => {
  it('distinguishes "user says they know it" from "demonstrated by recall"', () => {
    const claimed = st(log({ declarations: [claim([1, 1, 7], daysAgo(10))] }), 1, 3)
    expect(claimed.stage).toBe('claimed')
    expect(claimed.demonstrated).toBe(false)
    const verified = st(log({ declarations: [claim([1, 1, 7], daysAgo(10))], reviews: [review([1, 3, 3], 'independent', daysAgo(1))] }), 1, 3)
    expect(verified.stage).toBe('reviewing')
    expect(verified.demonstrated).toBe(true)
    expect(verified.verifiedIndividually).toBe(true)
  })
  it('does not mark passage-only success as individually verified', () => {
    const s = st(log({ reviews: [review([1, 1, 6], 'independent', daysAgo(1))] }), 1, 2)
    expect(s.demonstrated).toBe(true)
    expect(s.verifiedIndividually).toBe(false)
  })
  it('flags needs_repair after a failed attempt and clears it after a good one', () => {
    const failed = [review([2, 5, 5], 'independent', daysAgo(10)), review([2, 5, 5], 'failed', daysAgo(2))]
    expect(st(log({ reviews: failed }), 2, 5).stage).toBe('needs_repair')
    const healed = [...failed, review([2, 5, 5], 'independent', daysAgo(1)), review([2, 5, 5], 'independent', daysAgo(0.5))]
    // Recent lapse (<14d) still shows as needing repair until enough time passes.
    expect(st(log({ reviews: healed }), 2, 5, NOW).stage).toBe('needs_repair')
    expect(st(log({ reviews: healed }), 2, 5, NOW + 20 * DAY).stage).not.toBe('needs_repair')
  })
  it('is "learning" until the first accurate independent recall', () => {
    expect(st(log({ reviews: [review([2, 9, 9], 'prompted', daysAgo(1))] }), 2, 9).stage).toBe('learning')
    expect(st(log(), 2, 9).stage).toBe('not_started')
  })
  it('reaches "strongly retained" only with repeated independent success over spaced intervals', () => {
    // Review each time the model says it is due (stability ≈ days until due), eight times.
    const rs = [] as ReturnType<typeof review>[]
    let t = daysAgo(120)
    let gap = 1
    for (let i = 0; i < 8 && t < NOW; i++) {
      rs.push(review([3, 1, 1], 'independent', t))
      const m = deriveState(log({ reviews: rs })).memory.get('3:1')!
      gap = Math.max(1, m.stability)
      t += gap * DAY
    }
    const last = rs[rs.length - 1]!.occurredAt
    expect(st(log({ reviews: rs }), 3, 1, last + DAY).stage).toBe('strong')
    expect(st(log({ reviews: rs.slice(0, 2) }), 3, 1, rs[1]!.occurredAt + DAY).stage).not.toBe('strong')
  })
  it('is independent of the order events arrive in (rebuildable from the log)', () => {
    const rs = [review([1, 1, 1], 'independent', daysAgo(9)), review([1, 1, 1], 'hesitant', daysAgo(5)), review([1, 1, 1], 'failed', daysAgo(2)), review([1, 1, 1], 'independent', daysAgo(1))]
    const a = deriveState(log({ reviews: rs })).memory.get('1:1')
    const b = deriveState(log({ reviews: [...rs].reverse() })).memory.get('1:1')
    expect(a).toEqual(b)
  })
  it('tracks flow separately and never lets it change retention', () => {
    const base = deriveState(log({ reviews: [review([1, 1, 1], 'independent', daysAgo(3))] }))
    const withFlow = deriveState(log({
      reviews: [review([1, 1, 1], 'independent', daysAgo(3))],
      flows: [{ id: 'f1', surah: 1, ayah: 1, fromPhrase: 0, toPhrase: 0, phraseCount: 1, rating: 'natural', reps: 5, durationMs: 9000, occurredAt: daysAgo(1) }],
    }))
    expect(withFlow.memory.get('1:1')).toEqual(base.memory.get('1:1'))
    expect(withFlow.flow.get('1:1')!.rating).toBe('natural')
  })
  it('records shaky junctions from passage recitations', () => {
    const d = deriveState(log({ reviews: [review([2, 1, 3], 'hesitant', daysAgo(1), { shakyJunctions: [1] })] }))
    expect(d.junctions.get('2:1')!.shaky).toBeGreaterThan(0)
    expect(d.junctions.get('2:2')!.ok).toBeGreaterThan(0)
  })
})
