// Renders Qur'anic text exactly as stored. Words are never altered, split mid-word or
// re-ordered; hiding is done by replacing a word with a neutral bar in the display only.
import { useMemo, type CSSProperties, type ReactNode } from 'react'
import { arabicIndic, wordsOfAyah } from '@/lib/quran/data'
import type { Stage } from '@/lib/engine/derive'

export type Cue = 0 | 1 | 2 | 3 | 4

/** Which word indices stay visible at a given cue level (4 = none, 3 = first word, 2 = every third, 1 = two of three, 0 = all). */
export function visibleAt(cue: Cue, i: number): boolean {
  if (cue === 0) return true
  if (cue === 1) return i % 3 !== 2
  if (cue === 2) return i % 3 === 0
  if (cue === 3) return i === 0
  return false
}

export function AyahWords({ surah, ayah, cue = 0, dimOutside, gaps }: {
  surah: number; ayah: number; cue?: Cue
  /** Words outside [from, to] are dimmed (used by the phrase ladder). */
  dimOutside?: [number, number]
  /** Word indices after which to show a small gap (phrase boundaries). */
  gaps?: number[]
}) {
  const words = wordsOfAyah(surah, ayah)
  const gapSet = useMemo(() => new Set(gaps ?? []), [gaps])
  return (
    <>
      {words.map((w, i) => {
        const shown = visibleAt(cue, i)
        const dim = dimOutside && (i < dimOutside[0] || i > dimOutside[1])
        return (
          <span key={i}>
            {shown ? (
              <span className={`w${dim ? ' dim' : ''}`}>{w}</span>
            ) : (
              <span className="mask" style={{ width: `${Math.max(0.9, w.replace(/[ً-ٰٟۖ-ۭ]/g, '').length * 0.42)}em` } as CSSProperties} aria-hidden="true" />
            )}
            {i < words.length - 1 && (gapSet.has(i) ? <span className="phrase-gap"> </span> : ' ')}
          </span>
        )
      })}
    </>
  )
}

export function Medallion({ n }: { n: number }) {
  return <span className="medallion" aria-label={`ayah ${n}`}>{arabicIndic(n)}</span>
}

export interface PassageProps {
  surah: number
  ayahs: number[]
  cue?: Cue
  selected?: [number, number] | null
  onTap?: (ayah: number) => void
  stageOf?: (ayah: number) => { stage: Stage; r: number } | undefined
  center?: boolean
  /** Extra per-ayah content (e.g. translation) rendered below the passage is handled by callers. */
  dimOutside?: Record<number, [number, number]>
  gaps?: Record<number, number[]>
  children?: ReactNode
}

export function Passage({ surah, ayahs, cue = 0, selected, onTap, stageOf, center, dimOutside, gaps }: PassageProps) {
  return (
    <p className={`arabic${center ? ' center' : ''}`} lang="ar" dir="rtl">
      {ayahs.map((a) => {
        const sel = selected && a >= selected[0] && a <= selected[1]
        const st = stageOf?.(a)
        return (
          <span key={a}>
            <span
              className={`ayah${sel ? ' sel' : ''}`}
              data-ayah={a}
              data-stage={st?.stage}
              role={onTap ? 'button' : undefined}
              tabIndex={onTap ? 0 : undefined}
              onClick={onTap ? () => onTap(a) : undefined}
              onKeyDown={onTap ? (e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onTap(a)) : undefined}
            >
              <AyahWords surah={surah} ayah={a} cue={cue} dimOutside={dimOutside?.[a]} gaps={gaps?.[a]} />
              {' '}<Medallion n={a} />
            </span>{' '}
          </span>
        )
      })}
    </p>
  )
}
