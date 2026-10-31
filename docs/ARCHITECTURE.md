# Architecture

## Shape

```
src/lib/engine   pure TypeScript, no I/O: memory model, attribution, derive, planner, phrases, analytics, experiment
src/lib/quran    bundled verified text + metadata (read-only)
src/lib/store    Dexie (IndexedDB) repo, zod schemas, sync engine, Supabase adapter
src/lib/audio    swappable sources, AyahPlayer state machine
src/app          zustand store (state + actions), router
src/components   Arabic rendering, RecallCard, AudioBar, sheets, icons
src/pages        Today, Quran, Surah, Learn, Review, Session, Progress, Settings
supabase/        migration + RLS test script
data/            pinned sources, errata, cross-check hashes, provenance
```

## Decisions

1. **Event log is the source of truth.** `review_events`, `flow_events`, `declarations` are append-only (no update/delete policy,
   revoked privileges, update-blocking trigger). All learning state is *derived* and can be rebuilt; nothing stores a mutable "status".
2. **Claims are not evidence.** `declarations` seed a cautious prior (21 days) and appear as "marked known"; only a recall makes
   material "recalled". Verification of claims is scheduled, rate-limited.
3. **Flow is separate from recall.** Flow events never touch stability. The planner may *mention* flow in reasons (e.g. "flow natural
   but recall weakening") but never lets it raise a retention estimate.
4. **Passage recall is weak per-ayah evidence.** Weight = max(0.35, 1/(1+0.12(n−1))); flagged ayahs take the flagged outcome at full
   strength; ayahs after the stopping point are untested; only a one-ayah recall can mark an ayah "verified individually".
5. **Interpretable scheduler, not FSRS (yet).** Same curve shape as FSRS (`R(t)=(1+19/81·t/S)^-0.5`, R(S)=0.9) with hand-set updates
   (`src/lib/engine/memory.ts` PARAMS). Events keep what a fitted model needs (timestamps, grade, scope, cue level) so FSRS or a fitted
   variant can be compared offline later without migration.
6. **Static, client-side app.** Planner and analytics run in the browser against IndexedDB; works offline. Supabase is optional.
7. **Idempotent sync.** Client UUIDs + `ON CONFLICT DO NOTHING`; per-table `seq` cursor with overlap; quarantine for permanently
   rejected rows; device bound to one account; mutable rows last-writer-wins by `updated_at` enforced by a server trigger.
8. **Text integrity.** Pinned + checksummed source, cross-checked with two independent sources, whitespace-only errata, enforced by tests.

## Foundations for later

Event schema already carries `cue_level`, `strategy`, `experiment_id`, `listened_first`, `completed_to`, stumble markers and
junction events. Reserved for recitation intelligence: add a `recordings` table (RLS by user) and a `teacher_links` table; no existing
table changes. Audio sources are an interface. Targets are ranges, so page/juz/hizb goals are UI over existing data (`pageStarts`,
`juzStarts` are bundled).
