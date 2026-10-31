# Progress notes

## Implemented and tested

| Area | What exists | How it is verified |
|---|---|---|
| Qur'an data | 114 surahs / 6,236 ayahs, pinned + checksummed, cross-checked letter-for-letter and by spacing with two independent sources; 6 whitespace-only errata; page and juz tables | `tests/data.integrity.test.ts` (11 tests), build-time checks |
| Memory model | Forgetting curve (FSRS-shaped, hand-set defaults), claims vs demonstrated recall, derived from the event log | `tests/memory.test.ts`, `derive.test.ts` |
| Passage evidence | Conservative attribution: weight shrinks with length; stumble markers; untested ayahs after a stop; continuity tracked separately | `tests/attribution.test.ts` |
| Planner | Time-budgeted plan, risk ranking, load-sensitive new memorisation, recovery mode, verification of claims, per-item reasons | `tests/planner.test.ts` (21 scenarios) |
| Flow ladder | Waqf-aware suggestions (conservative), manual editing, overlapping chain ladder, long-ayah focus | `tests/phrases.test.ts` + e2e |
| Analytics | Coverage, retention by gap (Wilson intervals), learning pace by ayah length, weak spots, weekly time | `tests/analytics.test.ts` |
| 14-day experiment | Balanced assignment, A/B learning flows, delayed-recall readout with caveats, never declares a winner early | `tests/analytics.test.ts` |
| Local-first store | IndexedDB, add-only event writes, validated, backup export/import | `tests/sync.test.ts` |
| Sync | Idempotent upload, seq-cursor pull, quarantine of rejected rows, account binding, LWW for mutable rows | `tests/sync.test.ts` + Playwright offline/reconnect/lost-ack/2-device test |
| Audio | Per-ayah playback, repeat, speed, reciter choice, fallback hosts, explicit errors | `tests/audio.test.ts` + Playwright |
| UI | Today, Qur'an map, reader (mushaf / study), Learn, Review, transition drill, Session, Progress, Settings; light/dark; PWA manifest + service worker | Playwright (10 tests), visual review of screenshots |

## Not verified / known limits

* **Database:** the migration was applied to `hifz-os` by the owner via the dashboard. Verified from the real project: 8 tables with the
  intended columns/constraints/foreign keys, RLS enabled on all 8, and the Supabase security advisor reports a single WARN:
  `erase_my_data()` is a SECURITY DEFINER function callable by signed-in users. **Accepted, intentional**: it is the "erase all my data"
  feature, deletes only rows where `user_id = auth.uid()`, and is not executable by signed-out visitors.
* **RLS behaviour test (`supabase/tests/rls.sql`) must be run against the real project.** The MCP SQL tool required an approval that
  expired, so the test has not yet been executed there. It checks cross-user isolation, append-only history, constraints, idempotent
  inserts, signed-out access, export and erase.
* **The live Supabase project was unreachable from the build sandbox.** Sync was tested against a faithful in-test emulator of the
  REST/Auth endpoints, not the real service. RLS behaviour is specified in SQL but not yet executed.
* No iPhone/Safari testing. Audio from real hosts untested. Offline behaviour tested in Chromium only.
* Scheduling parameters are hand-set defaults; nothing is fitted or validated. The UI says so.
* Stop-mark phrase suggestions have not been reviewed by a teacher. The six spacing errata await review by a qualified reader.

## Not built (deliberately deferred)

Voice recording, speech recognition / tajweed feedback, teacher accounts, mutashabihat drills, page/juz/hizb targets,
multi-year roadmaps, placement probe for long-absent material, word-level audio alignment, audio caching, password reset UI,
Quran Foundation API integration, CSP headers, fitted FSRS.
