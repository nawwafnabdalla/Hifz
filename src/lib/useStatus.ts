import { useMemo } from 'react'
import { useApp } from '@/app/store'
import { ayahStatus, type AyahStatus, type Stage } from '@/lib/engine/derive'
import { ayahKey } from '@/lib/engine/types'
import { SURAHS } from '@/lib/quran/data'

export function useStatusFn() {
  const derived = useApp((s) => s.derived)
  const minute = Math.floor(useApp((s) => s.now) / 60000)
  return useMemo(() => (s: number, a: number): AyahStatus => ayahStatus(derived.memory.get(ayahKey(s, a)), derived.flow.get(ayahKey(s, a)), minute * 60000), [derived, minute])
}

export interface SurahRollup {
  surah: number
  total: number
  counts: Record<Stage, number>
  known: number          // claimed + demonstrated (any non-learning knowledge)
  strip: { stage: Stage; r: number }[]
}

const SEVERITY: Stage[] = ['needs_repair', 'learning', 'claimed', 'reviewing', 'strong', 'not_started']

export function useRollups(): SurahRollup[] {
  const status = useStatusFn()
  return useMemo(() => SURAHS.map((s) => {
    const counts: Record<Stage, number> = { not_started: 0, learning: 0, claimed: 0, reviewing: 0, needs_repair: 0, strong: 0 }
    const cells: { stage: Stage; r: number }[] = []
    for (let a = 1; a <= s.count; a++) { const st = status(s.n, a); counts[st.stage]++; cells.push({ stage: st.stage, r: st.retrievability }) }
    const bins = Math.min(s.count, 48)
    const strip: { stage: Stage; r: number }[] = []
    for (let b = 0; b < bins; b++) {
      const from = Math.floor((b * s.count) / bins), to = Math.floor(((b + 1) * s.count) / bins)
      const slice = cells.slice(from, Math.max(to, from + 1))
      // A bin shows its most attention-worthy stage; retrievability is averaged.
      const stage = SEVERITY.find((st) => slice.some((c) => c.stage === st))!
      const r = slice.filter((c) => c.stage === stage).reduce((n, c) => n + c.r, 0) / Math.max(1, slice.filter((c) => c.stage === stage).length)
      strip.push({ stage, r })
    }
    return { surah: s.n, total: s.count, counts, known: counts.claimed + counts.reviewing + counts.strong + counts.needs_repair, strip }
  }), [status])
}
