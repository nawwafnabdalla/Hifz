# Ayah-by-ayah revision, and checking what was actually recited

Core principle: **fluency is not proof of accuracy.** Hifz OS helps you remember what comes next *and* makes it easy to check what you recited against the text. It records what **you** report; it never grades pronunciation or tajweed and never certifies a recitation.

## What changed in revision (`RecallCard`)
* **One ayah at a time.** In a multi-ayah revision (for example Ta-Ha 7–9) each ayah has its own **Check ayah N** button under its hidden text. Checking one reveals only that ayah. A revealed ayah can be **hidden again** (and shown again). The run-up (ayah 6) is unchanged: shown, never tested, never recorded.
* **Recite straight through, then check.** Nothing forces a stop between ayahs. **Show all ayahs** is still one tap.
* A single ayah keeps its first-word / three-more-words hints and the Meaning option; it can also be hidden and shown again.

## What you can do once an ayah is revealed
* **Compare with the text**: for the first days a single line says to recite, then tap the text to check it; after that it gets out of the way.
* **Flag the word**: tap it, then (optionally) say what happened: **Forgot · Wrong word · Pronunciation** (the full names are Forgot it, Wrong word or vowel, Pronunciation / tajweed), or ✕ to clear. A bare tap marks the word and is treated as before.
* **Hear the reference**: the headphones in the toolbar play the ayah you are flagging a word in, or the whole passage, with the app's existing player and reciter setting.
* **Record yourself (optional)**: the microphone in the toolbar; see below.
* **Read before reciting / slips / shaky transitions / stopped early**: behind "⋯". An ayah marked "read before reciting" is assisted, not recall.

## Recall vs verification (how it is recorded)
| What happened | Recorded as |
|---|---|
| Recited an ayah with the text hidden, then revealed it | An independent recall attempt followed by feedback (cue level unchanged, **not** a hint) |
| Used the first-word hint before the attempt | Assisted recall: weaker evidence (cue 3), "on my own" unavailable (as before) |
| Marked **I read it before reciting** | No recall evidence for that ayah |
| Ayah never revealed (not compared with the text) | No evidence for that ayah; the note says so |
| Word flagged **Forgot it** | That ayah: "needed a prompt" |
| Word flagged **Wrong word or vowel** | That ayah: failed recall (the rest of a passage is credited as before) |
| Word flagged **Pronunciation / tajweed** | **Not a memory failure.** Stored as a concern and practised; memory evidence unchanged |
| Single ayah with a forgotten or wrong word | "On my own" and "Accurate, but unsure" are unavailable (they would contradict the flag); an honest grade is |
Nothing is called "verified" because a button said it felt right.

Flagged ayahs get the existing focused repair (the exact phrase pair, then return), one after another (up to four), and a "tangled" mark that the planner already uses to schedule repair. The weakened ayah also comes due sooner through the normal memory model.

## Data
`ReviewEvent` gains two **optional** fields: `checked` (ayahs compared with the text, present only when some ayah in the range was left unchecked) and `wordIssues` (word, ayah, kind). Unchecked ayahs at the ends are trimmed from the recorded range; a gap in the middle is listed exactly, and `completedTo` stops before it, so an older version or the cloud copy credits **less, never more** (tested). Events without the fields (all existing history) behave exactly as before. **Cloud sync carries only the original columns** (no migration was made): `checked` / `wordIssues` stay on the device and in backups. Backups (export/import) keep them.

## Optional self-recording
Tap **Record my recitation**, recite, tap stop, then listen back beside the text and the reference. It lives in the page's memory only: **never saved, never uploaded, not in backups, gone when you leave**. The microphone is requested only when you tap Record; if refused, the app says so and nothing else changes. It is not analysed. Not available where the browser lacks `MediaRecorder` (the button is simply absent).
**Not tested on a real iPhone** (Safari/PWA microphone and audio-session behaviour) , so treat it as untested there.

## Reference recordings and rights
No new audio source was added. "Hear reference" uses the app's existing per-ayah player and the reciter chosen in Settings. Those recordings are **streamed from third-party hosts that state no licence for programmatic use** (see `AUDIO.md`); the app does not store or redistribute them. So the reference is a *trusted-reciter* reference, **not a recording whose licence has been confirmed for public release**. Replacing the source with a licensed one (see `AUDIO.md`) needs no change here.

## Not claimed
No automatic tajweed or pronunciation grading; no claim that a recitation is correct; no change to the Qur'an text (every ayah is drawn from the stored words).

## Tests
`tests/revisionChecking.test.ts` (evidence rules, gap handling, never-more-credit, schema), `e2e/revision.spec.ts` (26 browser tests: Ta-Ha 7–9, one-at-a-time reveal and hide, verse numbers and exact text, hints, independent vs assisted evidence, flagging and repair, scheduling, persistence, recording, 390 px and 320 px layouts, accessibility, dark mode).
