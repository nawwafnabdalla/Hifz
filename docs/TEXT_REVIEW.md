# Qur'an text review pack

Prepared for a qualified reader (a teacher of Hafs ʿan ʿĀṣim, ideally with a Madinah Mushaf in hand). Everything below is generated
from the data in this repository and the two pinned independent sources; no Arabic has been typed or edited by hand.

**Nothing in the app's text was changed silently.** The primary source (`quran-json@3.1.2`, QuranEnc Uthmani) is stored unmodified in
`data/sources/`. The app applies only the six *whitespace-only* corrections in section 1, from `data/errata.json`, and tests fail if
anything else differs.

## 1. The six whitespace differences

Compared sources: **P** = primary (QuranEnc via `quran-json@3.1.2`), **T** = Tanzil v1.1 (`@muslims-community/quran@1.1.0`),
**Q** = QUL / Tarteel (`quran-validator@1.3.0`). For each ayah, P differed from *both* T and Q in word spacing only; T and Q agreed
with each other. Every letter is identical in the three (consonantal-skeleton equality), and each correction touches only U+0020 / U+2009.
Marks and signs are not altered by any correction.

| Ayah | Defect in P | Correction applied |
|---|---|---|
| 2:72 | a stray U+2009 THIN SPACE splits one word | remove the thin space |
| 15:7 | two words written joined | insert one U+0020 between the two words |
| 27:20 | two words written joined | insert one U+0020 between the two words |
| 36:22 | two words written joined | insert one U+0020 between the two words |
| 37:164 | two words written joined | insert one U+0020 between the two words |
| 41:47 | two words written joined | insert one U+0020 between the two words |

### Word-level evidence

The words involved, copied from each source (Arabic is right-to-left). Word counts are for the whole ayah; stand-alone stop-mark tokens that QUL writes separately are not counted as words.

#### 2:72

| Source | Words involved | Words in ayah |
|---|---|---|
| P as shipped | فَٱدَّـٰرَ ٰٔتُمۡ | 11 |
| T Tanzil | فَادّٰرَءتُم | 10 |
| Q QUL | فَٱدَّٰرَْٰٔتُمْ | 10 |
| **App (P + correction)** | فَٱدَّـٰرَٰٔتُمۡ | 10 |

Removed character: `U+2009` at index 36 of the ayah string, between `U+064E` and `U+0670`. It is the only non-U+0020 whitespace character in the entire primary text.

#### 15:7

| Source | Words involved | Words in ayah |
|---|---|---|
| P as shipped | لَّوۡمَا | 7 |
| T Tanzil | لَو ما | 8 |
| Q QUL | لَّوْ مَا | 8 |
| **App (P + correction)** | لَّوۡ مَا | 8 |

#### 27:20

| Source | Words involved | Words in ayah |
|---|---|---|
| P as shipped | مَالِيَ | 11 |
| T Tanzil | ما لِىَ | 12 |
| Q QUL | مَا لِىَ | 12 |
| **App (P + correction)** | مَا لِيَ | 12 |

#### 36:22

| Source | Words involved | Words in ayah |
|---|---|---|
| P as shipped | وَمَالِيَ | 7 |
| T Tanzil | وَما لِىَ | 8 |
| Q QUL | وَمَا لِىَ | 8 |
| **App (P + correction)** | وَمَا لِيَ | 8 |

#### 37:164

| Source | Words involved | Words in ayah |
|---|---|---|
| P as shipped | وَمَامِنَّآ | 5 |
| T Tanzil | وَما مِنّا | 6 |
| Q QUL | وَمَا مِنَّآ | 6 |
| **App (P + correction)** | وَمَا مِنَّآ | 6 |

#### 41:47

| Source | Words involved | Words in ayah |
|---|---|---|
| P as shipped | مَامِنَّا | 27 |
| T Tanzil | ما مِنّا | 28 |
| Q QUL | مَا مِنَّا | 28 |
| **App (P + correction)** | مَا مِنَّا | 28 |

## 2. Matters that still need a qualified human

These are not bugs I can resolve by comparing software sources; each needs someone who knows the mushaf.

1. **The six corrections above.** Please confirm each against the Madinah Mushaf. If any is wrong, delete its entry from
   `data/errata.json` and run `npm run data:build`; the build and tests will show exactly what then disagrees.
2. **Vowel marks and small signs are not verified to the same standard as the letters.** Letters and spacing agree 6,236 / 6,236 with two
   sources. For marks I compared P with Q cluster by cluster (the cluster count is equal in all 6,236 ayahs). After folding code points that
   are merely different encodings of the same sign (U+06E1→U+0652, U+0657→U+064B, U+0656→U+064D, U+065E→U+064C), **3,651 ayahs match exactly
   and 2,585 still differ** in at least one position (`data/review/diacritic-residuals.csv`). The commonest:

   | Positions | Primary (QuranEnc) | QUL | Likely nature |
   |---:|---|---|---|
   | 3,980 | U+0652 sukun | U+06DF small high rounded zero | silent-letter convention (the mushaf marks some silent letters with a rounded zero) |
   | 277 | U+0653 + U+0654 | none | maddah / hamza mark placement |
   | 207 | U+0652 | U+064E + U+0652 + U+0654 | hamza-mark encoding |
   | 129 / 97 / 96 | damma / fatha / kasra + small meem | tanween + small meem | iqlab encoding convention |

   Most of these are probably different encoding conventions for the same printed mark, but "probably" is not verification. A reviewer
   should sample the rounded-zero cases against the printed mushaf and confirm the primary source's convention is the intended one.
3. **Stop signs differ between P and Q in 323 ayahs** (174 with a different number of signs, 149 with the same number but different signs;
   `data/review/stop-sign-differences.csv`). The app shows P's signs unchanged and uses only some as *practice phrase suggestions*, never as
   stopping rulings: stop-required, stopping-preferred, permitted and pause are used; continue-preferred and paired only on request;
   do-not-stop never (`src/lib/engine/phrases.ts`). A reviewer should say which edition's signs are intended and review those rules.
4. **Annotation signs inside the text** (for example the hizb sign at the start of 41:47, sajdah signs) are kept exactly as the source has
   them. Tanzil's metadata lists 15 sajdah ayahs (7:206, 13:15, 16:50, 17:109, 19:58, 22:18, 22:77, 25:60, 27:26, 32:15, 38:24, 41:38,
   53:62, 84:21, 96:19); I have not verified that each carries the sign in the primary text.
5. **Page boundaries (604 pages)** come from `quran-meta@7.0.0` and were checked only for count and the first two pages; they have no
   second source. **Juz boundaries** were checked against Tanzil's per-ayah juz field: 0 mismatches in 6,236 ayahs.
6. **Rendering.** Text is displayed in Amiri Quran. Please check on an iPhone that signs (rounded zero, small meem, stop signs) look as in
   the printed mushaf. The app does not reproduce mushaf line or page layout.
7. **Translation** (Saheeh International via Tanzil) is not Qur'anic text but is shown beside it. Its terms (personal, verbatim,
   attributed) should be reviewed before any public release.

## 3. What is, and is not, claimed

* Claimed and tested: 114 surahs, 6,236 ayahs, Hafs numbering; letters and word spacing agree with two independent sources; the
  corrections are whitespace-only; juz boundaries agree with Tanzil.
* Not claimed: that every vowel mark and small sign matches the Madinah Mushaf; that stop signs are authoritative; that this app can
  stand in for a teacher or a printed mushaf.
