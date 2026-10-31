# Product-wide UX audit: recitation first

**Rule:** Open → Continue → Listen → Practise → Recall → Finish. The software decides; the Arabic is the visual priority; every extra tap must earn its place.

## What I changed
| Where | Before | After |
|---|---|---|
| Audio bar (every Learn/Review/Surah screen) | Two rows: play, prev/next, reciter, gear; status line "Ayah 2 · EveryAyah", Echo chip | **One row** at rest: play, prev/next, reciter, Echo. Status line only when something is happening. Host names are never shown. One tap on the reciter opens a single *Audio* sheet (reciter, Listen/Echo, pause length, "More options", offline card). The gear and the second sheet are gone. |
| Reciter sheet | Dot legend paragraph, a manual "Check my three reciters" probe, credits and licence text | Your three reciters, "More reciters" for the rest. The probe, credits and terms moved to **Settings → About → Audio sources & checks**. Dots stay (observed, not claimed). |
| Settings → Audio | Reciter, probe, credits paragraph | Reciter only. Offline recitations is its own section. "Daily time" removed (duplicate of Today's time pill). |
| Today | Six time chips + Custom, plan list, *then* the Begin button | **Begin session first**; time is one pill ("20 min today") that opens a sheet. Welcome paragraph cut to one sentence. "How the plan is chosen" halved. |
| Learn / Recall instructions | The same 20–30 word instruction on every ayah, forever | **Coach text**: the full sentence for your first three days with a step, then a short reminder (or nothing). "You haven't played the recitation yet…" removed. |
| Hint note | 17 words, apologetic | "Hints count as weaker evidence, so 'on my own' isn't available." (kept: it explains a disabled option) |
| Progress | Two statistics paragraphs and experiment copy | One-line captions; the method note sits under "How to read this". |
| Surah footer, Known/Passages/Goal sheets | 25–40 word intros | One sentence each. Provenance moved behind an "About this text" link. |

Kept on purpose: "Why this, today", the honest evidence notes, error messages, consent for downloads ("Best on Wi-Fi. It uses mobile data otherwise."), the study-aid disclaimer, and all credits and licence terms (now in About).

## Biggest remaining friction (ranked)
1. **Sound → Flow → Recall → Connect still needs a tap at each stage.** Idea: after the recitation ends, offer "Continue" as the primary action with the next stage auto-prepared, and skip Flow for ayahs under ~6 words.
2. **Plan review on Today before Begin.** Idea: most days you press Begin without reading the plan; show the plan collapsed ("4 items · 18 min") with Begin above it.
3. **Echo is discoverable but its pause length is not.** Idea: learn the pause from how long you take to say "done" in "Tap" mode, then propose it once.
4. **Repair tooling (slip → exact joint → ladder) has three entry points.** Idea: one "Practise this spot" action after any grade below "on my own".
5. **Reciter verification is manual.** Idea: verify automatically in the background on first play (the dot already turns green from real playback), and delete the manual probe from the main flow entirely once the iPhone checklist is complete.

## Ideas I did not build (too risky without a device)
* Auto-start the recitation on entering Sound (iOS may block autoplay after navigation).
* Auto-save goal audio "when on Wi-Fi": iOS Safari cannot tell Wi-Fi from mobile data, so this would not be real consent.
* Larger Arabic on short single-ayah Sound screens (needs on-device readability checks with the Mushaf font).

## Round 2 (final screens, screen by screen)
| Screen | Removed or shortened |
|---|---|
| Today | The empty-state Welcome card (the header already says it); the time pill is hidden until there is a plan; the "A 20-minute session" subtitle (it repeated the pill); goal rows no longer repeat their own title. |
| Learn, Sound | Larger Arabic for short ayahs (the card had empty space below it); the instruction fades after three days. |
| Flow | The repeated "Smooth and unhurried…" line under the counter. |
| Recall / Review | "Did a transition feel shaky? (end of one ayah into the next)" is now "Any shaky transitions?" |
| My Qur'an, Surah | The six-item colour legend sits behind "Colour key" instead of always showing. |
| Progress | Intro and chart captions cut to a line each; method notes behind "How to read this". |
| Settings | Offline recitations moved to the top with large Remove audio / Remove all downloads buttons and the measured total; hints cut. |
| Audio | One row at rest; one sheet; no host names; no download size shown before it is measured. |

Kept: consent ("Best on Wi-Fi. It uses mobile data otherwise."), "Why this, today", honest-evidence notes, errors, the study-aid statement, all credits and terms (Settings → About).
