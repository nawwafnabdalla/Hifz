import type { Grade } from '@/lib/engine/types'

/** The four self-grades, shared by every recall screen so they look and behave identically. Labels only: the detail lives in the accessible description. */
export const GRADES: { g: Grade; title: string; sub: string }[] = [
  { g: 'independent', title: 'On my own', sub: 'Accurate, without help' },
  { g: 'hesitant', title: 'Hesitated', sub: 'Accurate, but unsure' },
  { g: 'prompted', title: 'Needed a prompt', sub: 'Partly right' },
  { g: 'failed', title: 'Couldn’t recall', sub: 'Not yet' },
]

export function GradeGrid({ onGrade, busy, blocked, testPrefix = '', testId = 'grades' }: { onGrade: (g: Grade) => void; busy?: boolean; blocked?: (g: Grade) => boolean; testPrefix?: string; testId?: string }) {
  return (
    <div className="grid grid-cols-2 gap-2" role="group" aria-label="How was that?" data-testid={testId}>
      {GRADES.map((x) => {
        const off = blocked?.(x.g) ?? false
        return (
          <button key={x.g} disabled={busy || off} title={x.sub} onClick={() => onGrade(x.g)} data-testid={`${testPrefix}grade-${x.g}`}
            className={`btn h-12 ${x.g === 'independent' ? 'btn-primary' : 'btn-quiet'} !px-2 text-[0.9rem]`}>
            {x.title}<span className="sr-only">. {x.sub}</span>
          </button>
        )
      })}
    </div>
  )
}
