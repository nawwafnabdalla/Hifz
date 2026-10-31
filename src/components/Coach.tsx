import { useMemo } from 'react'

const KEY = 'hifz.coach.v1'
const FULL_DAYS = 3

/** Which days (YYYY-MM-DD) this instruction has been shown on, remembered on this device only. */
function daysFor(id: string): string[] {
  const today = new Date().toISOString().slice(0, 10)
  try {
    const all = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Record<string, string[]>
    const days = all[id] ?? []
    if (!days.includes(today)) { days.push(today); all[id] = days.slice(-10); localStorage.setItem(KEY, JSON.stringify(all)) }
    return days
  } catch { return [today] }
}

/**
 * Instructions teach once and then get out of the way: the full sentence is shown on your first few days of
 * using a step, then only the short reminder (or nothing, when the short form is empty).
 */
export function Coach({ id, full, short = '', className = '' }: { id: string; full: string; short?: string; className?: string }) {
  const showFull = useMemo(() => daysFor(id).length <= FULL_DAYS, [id])
  const text = showFull ? full : short
  return text ? <p className={className} data-coach={showFull ? 'full' : 'short'}>{text}</p> : null
}
