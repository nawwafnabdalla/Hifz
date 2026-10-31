# The next leap: decisions, what was built, what is unverified

Branch `claude/hifz-os-next` (production stays on `claude/hifz-os-feasibility-btrmfb` until approved).

## Principle
Judge every feature by one test: does it let the user spend more time reciting and less time operating the app?

## Decision matrix
Scores 1 to 5, higher is better in every column (cost columns are inverted: Ease 5 = cheap). Engineering and product judgement, not measurements.

| # | Candidate | Benefit | Daily | Fit | Ease | UI calm | Safety | Maint. | Reuse | Σ/40 | Verdict |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | Lead-in connect (new ayah joined to the known ayahs before it) | 4 | 4 | 5 | 5 | 5 | 5 | 5 | 5 | 38 | Built |
| 2 | Habit-time due window (fixes a 24 h slip for fixed-time routines) | 4 | 5 | 5 | 5 | 5 | 4 | 4 | 5 | 37 | Built |
| 3 | End-of-session summary | 3 | 5 | 5 | 4 | 5 | 5 | 4 | 5 | 36 | Built |
| 4 | Grouped queue, one Continue button | 3 | 5 | 3 | 5 | 5 | 5 | 5 | 5 | 36 | Built |
| 5 | Slip-to-repair + phrase-pair and ayah-junction repair | 4 | 4 | 5 | 4 | 5 | 4 | 4 | 5 | 35 | Built |
| 6 | Progressive hints + meaning cue | 4 | 4 | 5 | 4 | 4 | 4 | 4 | 5 | 34 | Built |
| 7 | Your three reciters with honest capability handling | 5 | 5 | 5 | 3 | 4 | 3 | 3 | 4 | 32 | Built (see audio status) |
| 8 | Listen → silence → recite (echo), which also covers hands-free | 5 | 5 | 5 | 3 | 4 | 3 | 3 | 4 | 32 | Built |
| 9 | Seamless resume | 3 | 5 | 3 | 4 | 5 | 4 | 4 | 4 | 32 | Built |
| 10 | Saved recitation passages (no new tab, no migration) | 3 | 3 | 4 | 4 | 4 | 3 | 3 | 4 | 28 | Built |
| 11 | Experiment expansion | 2 | 2 | 3 | 3 | 3 | 3 | 3 | 4 | 23 | Later: needs real history |
| 12 | Weekly insight; listen to tomorrow's passage; reciter per surah | 2 | 2 | 3 | 4 | 3 | 4 | 3 | 3 | ≤25 | Later |

**Rejected:** estimating ayah timestamps (would play the wrong words); a Salah tab; a tafsir or meaning subsystem (translation + a weighted "meaning" hint covers the need); reciter side-by-side comparison; a pronunciation-reference reciter; more elaborate forgetting maths (the planner's weakness was timing and interface, not equations).

## Where the brief's assumptions were adjusted
* **Fixed silent interval:** no single value fits a 3-word and a 128-word ayah. The pause is the ayah's real recording length × 1, 1.5 or 2, or open-ended ("Tap").
* **Locked iPhone:** timers freeze; media playback does not. Silences are generated silent audio clips driven by the `ended` event. Designed for this; **not verified on a locked iPhone**.
* **Hands-free** is echo plus a range plus "loop the passage". One system.
* **Resume** saves the learning position, never a half-finished recall (it returns hidden and ungraded).
* **Salah passages** reuse passage recall. Suggestions are only your own maximal connected, recently verified stretches; the app never picks stopping points.
* **Hints** reveal only words that are in the canonical ayah, cap the grade ("on my own" is disabled), and lower recorded evidence via the existing cue weight, so no schema change.

## Audio status (the one place the environment limited verification)
The build sandbox and two research agents could not reach `mp3quran.net`, `everyayah.com`, `api.alquran.cloud` or `api.quran.com` (DNS blocked), and web search found no verifiable per-verse files for Badr Al-Turki. So:

| Reciter | Verse-by-verse | Full surah | Status |
|---|---|---|---|
| Badr Al-Turki | none known, none claimed | MP3Quran catalogue, looked up by Arabic name at runtime | Shown as "full surah only". Never plays anyone else under his name. |
| Yasser Al-Dossary | EveryAyah folder `Yasser_Ad-Dussary_128kbps` (candidate) | MP3Quran, runtime | Becomes "confirmed" on-device only after a real file plays |
| Maher Al-Mu'aiqly | EveryAyah `MaherAlMuaiqly128kbps` / `Maher_AlMuaiqly_128kbps`, Islamic Network `ar.mahermuaiqly` (candidates) | MP3Quran, runtime | same |

* Candidate names are **not verified**; each reciter's dot in the picker is learned on the device: green = a verse file actually played, grey = not checked, red = none available.
* No verse timings are used or estimated. If a reciter has no verse-level audio, the bar says so and offers, explicitly, either another reciter "for this screen" (announced, never silent) or the full surah in a native audio player.
* The MP3Quran catalogue request is made from the phone at runtime and validated; if its shape is not what is expected, the reciter is reported unavailable.
