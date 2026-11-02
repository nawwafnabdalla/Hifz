# What must be true before phrase audio reaches production

Production branch: `claude/hifz-os-feasibility-btrmfb` (live, Cloudflare Workers Builds on push). **Two separate things now live on `claude/hifz-os-phrase-audio`.** (a) *Phrase audio* is **off in every ordinary build**: it exists only in builds made with `VITE_PHRASE_AUDIO=1` (the private test Worker, the browser tests, one CI step). Correction to an earlier note: a local `.env.production` had been used for that and was never committed; it is gone, and CI now proves an ordinary build bundles no phrase data. (b) *Part-by-part memorisation of long ayahs* (`PART_BY_PART.md`) is **not behind that flag**: it works without any audio, so a flag-off build of this branch is **not** identical to production. It must be released deliberately (gates 10–11). **Do not merge the timing data, the phrase UI, part-by-part learning or that variable into production until the gates for each are ticked.**

| # | Gate | State |
|---|---|---|
| 1 | Rights for each shipped recording established in writing, or an alternative recording used (`PHRASE_AUDIO_RIGHTS.md`) | **Open** |
| 2 | QUA timing attribution in About, stating changes | Done (shown only when the feature is on) |
| 3 | No corpus-derived (GPL) data in the bundle: shipped phrase model is spelling-only | Done (test-enforced) |
| 4 | Every shipped recording verified on real audio: engine cuts, acoustic checks over the whole recording, transcription sample (`PHRASE_AUDIO_PIPELINE.md`) | Yasser, Maher and Sudais (Tarteel): whole-Qur'an engine run at the 40 ms cut tolerance, 4,875 / 4,476 / 4,963 ayahs verified, all 67 warned phrases and a transcription sample checked, one transcription-confirmed defect held back; see `PHRASE_AUDIO_VALIDATION.md` §8 and `data/validation/`. Human review and rights are separate gates, both still open |
| 5 | Whole ayah and phrases come from the same recording | Done: built, browser-tested on a synthetic surah file, and checked on the real host (whole-ayah cut transcribes to the full ayah) |
| 6 | Real iPhone Safari and installed-PWA check (`IPHONE_CHECKLIST.md`): decode of a mid-stream MP3 window, background/lock behaviour, Range/CORS | **Open** (no device) |
| 7 | A qualified reader reviews the phrase gallery and the flagged ayahs; rejections go in `phrase-review.json` | **Open** |
| 8 | Data size plan: per-surah chunks, not precached (done: excluded from precache), full-Qur'an files are ≈1.6 MB raw / 0.5 MB gzip per recitation | Partly |
| 9 | Full unit, browser and CI runs green (flag on and flag off) | Unit 298 passed / 2 skipped. Browser: flag-off and flag-on suites re-run after the last change (see the engineering report for counts). Real-host (Chromium) runs: Yasser 20:94, 20:40; Maher 20:71 — every part exact-best in transcription |
| 10 | Part-by-part learning: a stored-data change is approved | **Open — needs your approval.** Local-only: new IndexedDB table `parts` (Dexie v2, additive, upgrade and old-backup import tested). Cross-device sync of part progress needs a new Supabase table (`part_events`, RLS as `review_events`); **no migration has been written into `supabase/migrations` or applied**. Until then part progress is on-device and in backups only |
| 11 | Part-by-part learning: used and judged on a real device by the owner, ideally with a teacher's view of the part boundaries | **Open** (not tested on an iPhone) |

Rollback: production is untouched. If part-by-part learning is ever merged, reverting the merge hides it; the `parts` rows stay in the learner's IndexedDB (unused, harmless, still exported in backups); the Dexie v2 upgrade does not remove anything on revert to v1 code (older code simply ignores the extra table).
