# What must be true before phrase audio reaches production

Production branch: `claude/hifz-os-feasibility-btrmfb` (live, Cloudflare Workers Builds on push). Phrase audio lives on `claude/hifz-os-phrase-audio` and is switched on only by `.env.production` (`VITE_PHRASE_AUDIO=1`). **Do not copy that file, the timing data or the phrase UI into production until every gate is ticked.**

| # | Gate | State |
|---|---|---|
| 1 | Rights for each shipped recording established in writing, or an alternative recording used (`PHRASE_AUDIO_RIGHTS.md`) | **Open** |
| 2 | QUA timing attribution in About, stating changes | Done (shown only when the feature is on) |
| 3 | No corpus-derived (GPL) data in the bundle: shipped phrase model is spelling-only | Done (test-enforced) |
| 4 | Every shipped recording verified on real audio: engine cuts, acoustic checks over the whole recording, transcription sample (`PHRASE_AUDIO_PIPELINE.md`) | Maher and Yasser: whole-Qur'an engine run, 4,508 / 4,891 ayahs verified, transcription sample and all warned phrases clean; see `PHRASE_AUDIO_VALIDATION.md` §6 and `data/validation/` |
| 5 | Whole ayah and phrases come from the same recording | Done: built, browser-tested on a synthetic surah file, and checked on the real host (whole-ayah cut transcribes to the full ayah) |
| 6 | Real iPhone Safari and installed-PWA check (`IPHONE_CHECKLIST.md`): decode of a mid-stream MP3 window, background/lock behaviour, Range/CORS | **Open** (no device) |
| 7 | A qualified reader reviews the phrase gallery and the flagged ayahs; rejections go in `phrase-review.json` | **Open** |
| 8 | Data size plan: per-surah chunks, not precached (done: excluded from precache), full-Qur'an files are ≈1.6 MB raw / 0.5 MB gzip per recitation | Partly |
| 9 | Full unit, browser and CI runs green with the flag on, and a flag-off build identical in behaviour to production | Feature branch: 269 unit + 61 browser tests pass with the flag on; a flag-off build bundles no phrase data (verified). A full flag-off browser run is not done |
| 10 | No database migration and no change to stored data shapes | True today (IndexedDB schema and Supabase untouched) |

Rollback: production is untouched; if this is ever merged, revert the merge commit (the app's stored data is unaffected, as nothing in the learning data model changed).
