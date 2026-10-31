# Qur'an data: provenance, licences and integrity

Treat this as the contract for the Arabic text. **Nothing in this repo reconstructs, paraphrases or "fixes" Qur'anic text.** The only
intentional deviation from the pinned source is six whitespace-only corrections, listed below and enforced by tests.

## Primary text (bundled in the app)

| | |
|---|---|
| Package | `quran-json@3.1.2` (npm; **deprecated**, kept only as a frozen, checksummed snapshot) |
| Upstream | The Noble Qur'an Encyclopedia (QuranEnc) Uthmani text, Hafs |
| Vendored | `data/sources/quran-json-3.1.2/quran.json` sha256 `d8a8adff…cefd4`, `quran_en.json` sha256 `bae3acab…a7a3` |
| Registry integrity | `sha512-K0RURQSueVUMpDkZCnfXhck6YCX2lEJCar0SsI2naNDgei/crtrVfRHavZk14tw0TJlGQd/zl3tABSOGQrJLYQ==` |
| Licence | Package: CC-BY-4.0 / CC-BY-SA-4.0 (see `LICENSE.txt` beside the data). QuranEnc permits verbatim republication with credit. |
| Numbering | Hafs, 114 surahs, 6,236 ayahs. Bismillah is ayah 1 of Al-Fatihah only; for other surahs it is shown as a header using the text of 1:1, never as an ayah. |

The build (`npm run data:build`) refuses to run if either vendored file differs from its pinned checksum.

## Independent cross-checks (hashes only; their text is not stored here)

`data/crosscheck/skeleton-hashes.json` holds short SHA-256 hashes of each verse's consonantal skeleton (all vowel marks, annotation
signs and tatweel removed; alef/ya/hamza carriers folded) from two sources with different upstreams:

| Source | Fetched via (pinned, sha512-verified by `npm run data:crosscheck`) | Upstream |
|---|---|---|
| Tanzil v1.1, Uthmani minimal | `@muslims-community/quran@1.1.0` | Tanzil Project (CC BY 3.0) |
| QUL Uthmani | `quran-validator@1.3.0` | Tarteel Quranic Universal Library (Madinah Mushaf) |

Result, enforced in `tests/data.integrity.test.ts` on every test run:

* **6,236 / 6,236** ayahs agree letter-for-letter with both sources.
* **6,236 / 6,236** agree on word spacing with both sources *after* the errata below.
* Stop-mark sequences are *not* asserted: they agree with QUL in 5,913 / 6,236 verses (sources differ in which signs they carry).
  Stop marks are shown and used only as practice suggestions, never as rulings.

## Errata (whitespace only)

Before errata the primary source differed from *both* independent sources in exactly six verses, all in spacing:

| Ayah | Issue in primary source | Correction |
|---|---|---|
| 2:72 | a stray U+2009 THIN SPACE splits one word | remove it |
| 15:7, 27:20, 36:22, 37:164, 41:47 | two words written joined (لَّوۡمَا, مَالِيَ, …) | insert one space |

`data/errata.json` stores `before` and `after` for each. The build verifies `before` equals the source, and that `after` differs only in
whitespace. Tests re-check this. **Pending review by a qualified reader**; if any entry is disputed, delete it from `errata.json`,
run `npm run data:build`, and the tests will tell you what then disagrees.

## Translation

English: Saheeh International via Tanzil, as shipped in `quran-json@3.1.2`. Tanzil's terms allow verbatim, attributed use. **Review those
terms before any public or commercial release**; for a public release consider a public-domain edition instead.

## Metadata

Page (Madinah, 604) and juz boundaries come from `quran-meta@7.0.0` (MIT), build-time only, sanity-checked in the build.

## Audio

Not hosted or redistributed. Per-ayah files are *linked* from third-party hosts (see `src/lib/audio/sources.ts`); some of those hosts
state no licence. See the Settings → About screen and `docs/AUDIO.md`.

## Madinah display layer (additional, does not replace the above)
`src/data/generated/mushaf-display.json` holds the official KFGQPC Hafs v3.0 text (from `@quran.ws/text@0.1.0`, CC BY 4.0, integrity-pinned in
`scripts/build-mushaf-display.mjs`), aligned word for word with the canonical text and used only for drawing. `data/crosscheck/qpc-v3-ayah-hashes.json`
holds the hash of every official ayah; tests require the shipped display text to match them and to share letters with the canonical text word by word.
Details, licensing and findings: `docs/TYPOGRAPHY.md`, `docs/THIRD_PARTY.md`.

## Review pack

`docs/TEXT_REVIEW.md` documents the six whitespace corrections word by word against both independent sources, and lists every
remaining matter that needs a qualified reader (vowel-mark conventions, 323 ayahs with differing stop signs, page table, rendering).
Supporting data: `data/review/*.csv`. Juz boundaries are additionally checked against Tanzil's metadata
(`data/crosscheck/juz-starts-tanzil.json`, enforced by a test).

## Known limits

* Not a substitute for a printed mushaf or a qualified teacher; the app should say so wherever correctness matters.
* Script variants (Indo-Pak, KFGQPC Hafs) are not bundled. The Uthmani text renders in Amiri Quran (OFL).
