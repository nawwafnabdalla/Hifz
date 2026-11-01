# Licensing position for phrase-by-phrase audio and the automatic phrase model

Engineering analysis, **not legal advice**. Written 1 Nov 2026. Decisions that carry legal risk are marked **[owner decision]**.

## 1. The Quranic Arabic Corpus (GNU GPL) and our generated boundary scores
Facts: the project owner confirmed that https://corpus.quran.com/download/ states GNU GPL terms with attribution and notice requirements for the corpus (v0.4 morphology; the build used the `mustafa0x/quran-morphology` fork, SHA-256 `742bfac5…`).

Question: do scores *derived* from it, and shipped in the app, carry GPL obligations? "We only used it at build time" does **not** settle that. What matters is whether what we distribute is a *work based on* the corpus.
* A per-word probability table learned from corpus features and shipped as `phrase-candidates.json` is derived data. Whether a statistical summary counts as "a work based on" a GPL dataset is genuinely unsettled; a conservative reading says it may.
* If it does, GPL conveyance rules apply to the app that bundles it: corresponding source, the same licence for the combined work, notices. The app bundles components that cannot be relicensed under GPL (for example the KFGQPC mushaf font whose EULA forbids modification, and the Qur'an text with its own terms), so "GPL-3 the whole app" is not a free action either.
* A conservative engineering stance avoids the question rather than argue it.

**What was done (shipped):** the shipped model no longer uses any corpus-derived feature. `scripts/build-phrase-candidates.mjs --features orth` builds the model from **spelling only** (function-word lists written by us from Arabic grammar, orthographic patterns, the printed stop signs as training signal). Held-out accuracy is lower (grouped-by-surah CV AUC **0.89** vs 0.94 with the corpus; recorded in `data/crosscheck/phrase-model-report.json`), and the engine's extra rules (subordinator veto, floors, piece-length penalties) compensate. The corpus-based variant remains a **developer-only** comparison: output goes to the git-ignored `data/gpl/` and `data/crosscheck/phrase-model-report-qac-devonly.json` (a report of numbers, not corpus data). A test fails if the shipped candidate file claims to be corpus-derived.

**What this does not settle:** whether the stop signs, our function-word lists, or the Qur'an text we ship have their own terms (see `THIRD_PARTY.md`); and whether the AUC-0.94 model could ever be shipped.

**[owner decision] options if the stronger model is wanted**
1. Ask the corpus authors (corpus.quran.com contact) for written permission to ship derived scores under the app's licence. Cheapest if they agree.
2. Release the app (or the model data as a separately licensed GPL data file) under GPL-3 with the required notices. Check the font EULA conflict first.
3. Keep the corpus model personal-use only (never deployed). This is the current state.
Until one of these is chosen, production must not carry corpus-derived data.

## 2. Quranic Universal Audio v4.0.0 (timings) vs recordings (audio)
* QUA's own work — timestamps, segmentation, alignment, catalogue metadata and code — is **CC BY 4.0** (README/LICENSE read). Obligations: attribution, a link to the licence, and an indication of changes. We transform timings (rebase to ayah windows, drop failing ayahs), so the importer records provenance (`source`, `licence`, `url`, `retrieved`, `method`) in each data file and About must credit QUA before any imported file ships.
* **Recordings remain the property of the reciters and their original hosts** (README). CC BY 4.0 on timings gives no right over the audio. The app therefore streams audio from the host's URL (EveryAyah/MP3Quran/etc.); it never re-hosts audio, and **offline saving stays off unless the host's own terms allow it** (`SOURCE_RIGHTS`; MP3Quran and any QUA-listed host default to *not savable* until read and recorded).
* Per-recitation licences may differ inside the QUA catalogue (not read). The importer takes `--licence` explicitly and refuses to run without it; check the catalogue entry per recitation before importing.
* Caching of byte ranges by the service worker is a form of saving: do not enable it for a host whose terms disallow it.

## 3. Integrity rules (enforced in code)
* Canonical text is never altered; timings only point into it, and an ayah whose word count differs from the canonical text is dropped.
* Riwayah: only `hafs` is accepted by the importer and the registry. Other qirāʾāt are never mixed, even for the same reciter.
* The learner always hears the reciter they selected; on any mismatch the same reciter's whole ayah plays and the reason is stated. No silent reciter switch.
* Alignment does not establish tajwīd or religious correctness of a recitation; it only says where words are in a file. Nothing in the UI claims otherwise.

## 4. Release gates before any production deployment of phrase audio
1. Written decision on §1 (current shipped model is already corpus-free).
2. About credits for QUA/Quran Align (CC BY 4.0), with change statement.
3. Licence of each imported recitation read from the catalogue and recorded in the data file.
4. Real-data import report reviewed (skips explained), Ta-Ha 94 heard on a real device for each recitation.
5. Range/CORS verified on the actual audio host for surah recordings.
6. A qualified reader's review of the phrase gallery, recorded in `phrase-review.json`.
