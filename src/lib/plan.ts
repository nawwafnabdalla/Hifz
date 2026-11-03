// Glue between app state and the pure planner.
import { buildPlan, type Plan } from '@/lib/engine/planner'
import { learningSamples, learningSecPerWord } from '@/lib/engine/analytics'
import type { Derived } from '@/lib/engine/derive'
import { DAY, type Settings } from '@/lib/engine/types'
import type { Snapshot } from '@/lib/store/repo'
import { corpus, surahInfo, wordsOfAyah } from '@/lib/quran/data'
import { buildPhrases, suggestBoundaries } from '@/lib/engine/phrases'
import { isPartsLayout } from '@/lib/engine/parts'

export const startOfLocalDay = (t: number) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime() }

export function computePlan(snap: Snapshot, derived: Derived, now: number, settings: Settings = snap.settings): Plan {
  const today = startOfLocalDay(now)
  let learnedToday = 0
  for (const m of derived.memory.values()) if (m.firstDemonstratedAt !== null && m.firstDemonstratedAt >= today && m.claimed === false) learnedToday++
  const samples = learningSamples(snap.reviews, snap.flows, corpus)
  const lastSession = snap.sessions.reduce<number | null>((acc, s) => Math.max(acc ?? 0, s.endedAt ?? s.startedAt), null)
  const lastAny = Math.max(lastSession ?? 0, derived.lastActivityAt ?? 0) || null
  return buildPlan({
    now, derived, corpus, targets: snap.targets, minutes: settings.minutes, planNew: settings.planNew, newPerDayCap: settings.newPerDayCap,
    learnedToday, learningSecPerWord: learningSecPerWord(samples), lastSessionAt: lastAny, surahName: (s) => surahInfo(s).tr,
    // The practice phrases an ayah is learned in: the learner's own marker, otherwise the mushaf's printed stop signs (the same default the Learn page uses).
    partsLayout: (surah, ayah) => {
      const w = wordsOfAyah(surah, ayah)
      const m = snap.markers.find((x) => x.id === `${surah}:${ayah}`)
      const spans = buildPhrases(w, m ? m.boundaries : suggestBoundaries(w).boundaries).map((p) => ({ from: p.from, to: p.to }))
      return isPartsLayout(spans, !!m && m.boundaries.length > 0) ? spans : null
    },
  })
}
export { DAY }
