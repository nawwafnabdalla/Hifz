import { describe, expect, it } from 'vitest'
import { attribute } from '@/lib/engine/attribution'
import { checkedAttempt, contradictsAccurate, mergeStumbles, stumbleFor } from '@/lib/engine/check'
import { deriveState } from '@/lib/engine/derive'
import { reviewEventSchema } from '@/lib/store/schemas'
import { SPECS } from '@/lib/store/sync'
import type { ReviewEvent, WordIssue } from '@/lib/engine/types'
import { review, NOW } from './helpers'

const R = (start: number, end: number) => ({ surah: 20, start, end })

describe('what a flagged word says about memory', () => {
  it('forgot = needed a prompt; wrong word or vowel = failed; pronunciation / tajweed = not a memory failure', () => {
    expect(stumbleFor('forgot', true)).toBe('prompted')
    expect(stumbleFor('wrong', true)).toBe('wrong')
    expect(stumbleFor('pronunciation', true)).toBeNull()
    expect(stumbleFor('pronunciation', false)).toBeNull()
  })
  it('an unclassified slip in one ayah leaves the verdict to the grade; in a passage it localises the problem to that ayah', () => {
    expect(stumbleFor('slip', true)).toBeNull()
    expect(stumbleFor('slip', false)).toBe('prompted')
  })
  it('merges the ayah chips with the word flags, the most serious winning', () => {
    const issues: WordIssue[] = [{ ayah: 8, word: 2, kind: 'wrong' }, { ayah: 9, word: 1, kind: 'pronunciation' }, { ayah: 7, word: 0, kind: 'forgot' }]
    const out = mergeStumbles(new Map([[7, 'blank'], [8, 'hesitated']]), issues, false)
    expect(Object.fromEntries(out.map((s) => [s.ayah, s.kind]))).toEqual({ 7: 'blank', 8: 'wrong' })      // 9: pronunciation only -> no memory flag
  })
  it('only a forgotten or wrong word contradicts an accurate recall', () => {
    expect(contradictsAccurate([{ ayah: 1, word: 0, kind: 'pronunciation' }])).toBe(false)
    expect(contradictsAccurate([{ ayah: 1, word: 0, kind: 'slip' }])).toBe(false)
    expect(contradictsAccurate([{ ayah: 1, word: 0, kind: 'forgot' }])).toBe(true)
    expect(contradictsAccurate([{ ayah: 1, word: 0, kind: 'wrong' }])).toBe(true)
  })
})

describe('recording an attempt that was checked ayah by ayah', () => {
  it('all checked: the range is unchanged and nothing extra is stored', () => {
    expect(checkedAttempt(R(7, 9), [7, 8, 9])).toEqual({ range: R(7, 9), completedTo: undefined })
  })
  it('unchecked ayahs at either end are simply not part of the record', () => {
    expect(checkedAttempt(R(7, 9), [8, 9])!.range).toEqual(R(8, 9))
    expect(checkedAttempt(R(7, 9), [7])!.range).toEqual(R(7, 7))
    expect(checkedAttempt(R(7, 9), [7, 8])).toEqual({ range: R(7, 8), completedTo: undefined })
  })
  it('a gap in the middle is listed exactly, and completedTo stops before it so an older version credits less, never more', () => {
    expect(checkedAttempt(R(7, 9), [7, 9])).toEqual({ range: R(7, 9), checked: [7, 9], completedTo: 7 })
    expect(checkedAttempt(R(7, 12), [8, 9, 11, 12])).toEqual({ range: R(8, 12), checked: [8, 9, 11, 12], completedTo: 9 })
  })
  it('"I stopped before the end" excludes the ayahs after it even if they were revealed', () => {
    expect(checkedAttempt(R(7, 9), [7, 8, 9], 8)!.range).toEqual(R(7, 8))
  })
  it('nothing checked = nothing to record', () => { expect(checkedAttempt(R(7, 9), [])).toBeNull() })
})

describe('evidence only comes from ayahs that were compared with the text', () => {
  const ev = (over: Partial<ReviewEvent>) => review([20, 7, 9], 'independent', NOW, over)
  it('an event without `checked` is attributed exactly as before', () => {
    const a = attribute(ev({}))
    expect(a.ayahs.map((x) => x.ayah)).toEqual([7, 8, 9])
    expect(a.junctions.map((j) => j.from)).toEqual([7, 8])
  })
  it('an unchecked ayah in the middle carries no evidence and breaks both junctions around it', () => {
    const a = attribute(ev({ checked: [7, 9], completedTo: 7 }))
    expect(a.ayahs.map((x) => x.ayah)).toEqual([7, 9])
    expect(a.junctions).toHaveLength(0)
  })
  it('the weight stays that of a passage of three: checking fewer ayahs never raises the credit of those checked', () => {
    const all = attribute(ev({})), gap = attribute(ev({ checked: [7, 9], completedTo: 7 }))
    expect(gap.ayahs[0]!.weight).toBe(all.ayahs[0]!.weight)
  })
  it('what an older version or another device sees (`checked` lost, completedTo kept) is never MORE than the precise record', () => {
    const precise = ev({ checked: [7, 9], completedTo: 7 })
    const { checked: _c, ...legacy } = precise
    const p = new Set(attribute(precise).ayahs.map((x) => x.ayah))
    for (const x of attribute(legacy as ReviewEvent).ayahs) expect(p.has(x.ayah)).toBe(true)
  })
  it('the cloud copy of an event (the original columns only) is never MORE than the precise record', () => {
    const spec = SPECS.find((s) => s.key === 'reviews')!
    const precise = ev({ id: crypto.randomUUID(), checked: [7, 9], completedTo: 7, wordIssues: [{ ayah: 9, word: 1, kind: 'pronunciation' }] })
    const back = spec.fromRow!(spec.toRow!(precise as never) as never) as ReviewEvent
    const p = new Set(attribute(precise).ayahs.map((x) => x.ayah))
    for (const x of attribute(back).ayahs) expect(p.has(x.ayah)).toBe(true)
  })
  it('a pronunciation concern is not a memory failure: the memory state is the same with or without it', () => {
    const plain = ev({ id: crypto.randomUUID() })
    const flagged = { ...plain, id: crypto.randomUUID(), wordIssues: [{ ayah: 8, word: 1, kind: 'pronunciation' as const }], stumbles: mergeStumbles(new Map(), [{ ayah: 8, word: 1, kind: 'pronunciation' }], false) }
    const a = deriveState({ reviews: [plain], flows: [], declarations: [] }).memory.get('20:8')!
    const b = deriveState({ reviews: [flagged as ReviewEvent], flows: [], declarations: [] }).memory.get('20:8')!
    expect({ ...b, lastEvidenceAt: 0 }).toEqual({ ...a, lastEvidenceAt: 0 })
  })
  it('a wrong word marks that ayah failed at full strength and the rest of a successful passage is still credited', () => {
    const e = ev({ stumbles: mergeStumbles(new Map(), [{ ayah: 8, word: 2, kind: 'wrong' }], false), wordIssues: [{ ayah: 8, word: 2, kind: 'wrong' }] })
    const by = Object.fromEntries(attribute(e).ayahs.map((x) => [x.ayah, x]))
    expect(by[8]).toMatchObject({ outcome: 'failed', weight: 1 })
    expect(by[7]!.outcome).toBe('independent')
  })
})

describe('storage and backups', () => {
  const base = review([20, 7, 9], 'independent', NOW, { id: crypto.randomUUID(), checked: [7, 9], completedTo: 7, wordIssues: [{ ayah: 9, word: 3, kind: 'forgot' }] })
  it('a backup keeps the new fields; old events (without them) still validate', () => {
    const ok = reviewEventSchema.safeParse(base)
    expect(ok.success && ok.data.checked).toEqual([7, 9])
    expect(ok.success && ok.data.wordIssues).toEqual([{ ayah: 9, word: 3, kind: 'forgot' }])
    const { checked: _c, wordIssues: _w, ...old } = base
    expect(reviewEventSchema.safeParse(old).success).toBe(true)
  })
  it('rejects a word issue of an unknown kind', () => {
    expect(reviewEventSchema.safeParse({ ...base, wordIssues: [{ ayah: 9, word: 3, kind: 'perfect' }] }).success).toBe(false)
  })
})
