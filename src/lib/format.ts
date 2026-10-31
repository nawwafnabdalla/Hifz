import type { PlanKind } from '@/lib/engine/planner'
import { surahInfo } from '@/lib/quran/data'
import type { Range } from '@/lib/engine/types'

export const KIND: Record<PlanKind, { label: string; hint: string; cls: string }> = {
  sabqi: { label: 'Recent revision', hint: 'Sabqi', cls: 'bg-accent-soft text-accent-strong' },
  repair: { label: 'Repair', hint: 'Needs attention', cls: 'bg-clay-soft text-clay' },
  new: { label: 'New', hint: 'Sabaq', cls: 'bg-brass-soft text-brass' },
  manzil: { label: 'Older revision', hint: 'Manzil', cls: 'bg-surface-2 text-ink-2' },
  verify: { label: 'Check what you know', hint: 'Verify', cls: 'bg-surface-2 text-ink-2' },
}

export const rangeTitle = (r: Range) => {
  const n = surahInfo(r.surah).tr
  return r.start === r.end ? `${n} ${r.start}` : `${n} ${r.start}–${r.end}`
}
export const rangePath = (base: 'learn' | 'review', r: Range, q = '') => `/${base}/${r.surah}/${r.start}/${r.end}${q}`

export const dateLabel = (t: number) => new Date(t).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })
export const shortDate = (t: number) => new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })

export function pct(x: number | null | undefined) { return x == null ? '–' : `${Math.round(x * 100)}%` }
export function secs(x: number | null | undefined) { return x == null ? '–' : x < 90 ? `${Math.round(x)} s` : `${(x / 60).toFixed(1)} min` }
