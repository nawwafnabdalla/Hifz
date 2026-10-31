# Madinah Mushaf typography: decision record

## Goal
Writing that feels like the printed Madinah Mushaf (Hafs ʿan ʿĀṣim, King Fahd Glorious Quran Printing Complex), everywhere Arabic appears, without
altering the canonical text and without breaking word-level features (hints, masks, phrase ladder, slip marking).

## Approaches considered
| # | Approach | Verdict |
|---|---|---|
| 1 | Keep Amiri Quran | Beautiful, but not the Madinah script, and it had no glyph for 1,807 marks (fixed separately). Kept as the **Simple** script and as the automatic fallback. |
| 2 | KFGQPC page fonts (QCF v1–v4): one font per mushaf page, text stored as private-use glyph codes | **Rejected.** No Unicode text, so word masks, hints, phrases and search are impossible; 604 fonts; unlicensed for us. |
| 3 | Third-party repackaged copies of the font (npm, font-hosting sites) | **Rejected.** Their own licences (ISC etc.) cannot grant more than the Complex granted, and provenance is unclear. |
| 4 | The Complex's Unicode font **KFGQPC HAFS Uthmanic Script v3.0**, drawing our canonical text as is | Partly wrong: the font's open-tanween signs are U+08F0–U+08F2, while our source encodes them as other marks, and our source adds "seat" kashidas the official text omits. |
| 5 | Migrate the canonical text to the official encoding | The right long-term question, but a change to canonical text needs **explicit approval**. Evidence is below; **not done**. |
| 6 (**chosen**) | **Display layer**: the official text, word for word, aligned 1:1 to the canonical words, drawn in the official font | Canonical text untouched; every learning feature keeps using canonical words; official glyph strings are used only where letter-for-letter alignment is proven (6,235 of 6,236 ayahs); automatic fallback otherwise. |

## Licence (read from the font file itself)
The font's embedded end-user licence (`data/fonts/KFGQPC-EULA.txt`): free of cost to use, copy and distribute; **the font cannot be sold, modified, altered,
translated, reverse engineered or reproduced**. Therefore:
* the font is shipped as the **byte-identical TTF** (no WOFF2 conversion, no subsetting), with its licence inside it. `tests/mushaf.test.ts` fails if the bytes change;
* it is served, not sold; the app is free;
* credit to the Complex is shown in Settings → About.
Not legal advice. If Hifz OS is ever published widely or commercially, ask the Complex (fonts.qurancomplex.gov.sa) to confirm in writing. I could not read their website from the build
environment, and I could not confirm the file against the Complex's own download; the checksum matches the one recorded in the quran.ws dataset for the v3.0 release.

## Compatibility
* Every character of the official text has a glyph in the font (tested). The font provides the end-of-ayah sign and digits, ligatures (liga, rlig, calt) and mark positioning (mark, mkmk).
* Words are separate spans, so per-word masks, hints, slip marking and the phrase ladder work unchanged; dimming and phrase gaps tested in Chromium at 390 px.
* Dark mode and the text-size slider use the same CSS variables.
* Font size 301 KB; precached for offline. **iOS Safari rendering is not verified** (no device here).
* If the font cannot load, the app silently uses the Simple script; it never draws official text in a font that lacks its signs.

## The official text vs our canonical text (the finding behind approach 5)
Compared ayah by ayah with the Complex's v3.0 text (dataset `@quran.ws/text`):
* **5,296** ayahs identical after the documented open-tanween mapping (U+0657→U+08F0, U+065E→U+08F1, U+0656→U+08F2) and mark-order folding.
* **937** differ only in "seat" kashidas (our source writes 1,652; the official text 535).
* **3** genuinely differ: **2:72** (the hamza is spelled differently), **15:7** (see below), **52:37** (our source has the small *high* seen U+06DC, the official text the small *low* seen U+06E3).
* **Stop signs** match the official text in **6,233** of 6,236 ayahs (the 323-ayah disagreement is with the QUL dataset, not the Complex).

### Two findings that touch earlier work (decision needed, not applied)
1. **15:7**: our whitespace erratum inserted a space ("لَّوۡ مَا", on the strength of Tanzil and QUL). The Complex's own text writes it joined ("لَّوۡمَا"), as the original source did. The other four spacing errata (and the 2:72 fix) are **confirmed** by the official text. Recommendation: revert the 15:7 erratum. Until you approve, canonical text is unchanged and the Mushaf script shows the canonical spacing for that one ayah.
2. **52:37**: recommend replacing U+06DC by U+06E3 in canonical text. The Mushaf script already shows the official sign.
Both need a qualified reader's confirmation before any canonical change.

## 15-line Madinah layout (assessment; deferred)
* Data exists (CC BY 4.0): 604 page starts and 8,820 line starts by word index; 506 of 604 pages have exactly 15 text lines in the data.
* But the dataset itself says printed lines are **reconstructed from the release document's line breaks, not encoded**, and it validates only per-ayah, not against page images. Fidelity is unverified.
* Rendering needs a fixed-aspect page and per-line fitting (justification with this font), which is a layout engine, plus work for phones in portrait.
* Licensing is fine for the data (CC BY) but the layout claim "matches the printed Mushaf" would need independent verification against page images.
* Recommendation: next release, as an experimental reader mode, after verifying the line data against official page images.
