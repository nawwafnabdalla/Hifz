# Interface principles (premium minimalism)

The Qur'an is the screen. Everything else has to earn its place.

1. **The text is the control.** In revision, tap a concealed ayah to reveal it; tap its verse mark to hide it again; tap a word of a revealed ayah to flag it. There are no per-ayah buttons.
2. **One primary action at a time.** Learning screens have one filled button (Continue, a grade, Begin session). Everything else is quiet.
3. **Secondary actions are small and contextual.** Hint, meaning, show/hide all, reference audio, record and "more" are one row of icon-sized controls (`.tool`, 44 px targets). Reference audio plays the ayah you are flagging a word in, or else the passage. The less common revision controls (slip kinds, shaky transitions, stopped early, read before reciting) sit behind "⋯".
4. **Say it once, or not at all.** Explanations live where they are needed and teach for a few days (`Coach`), or sit one tap away (the (i) beside "Part A" explains where the parts come from and that they are not places to stop). No repeated warnings, eyebrows, subtitles or footers.
5. **Cards only where they help.** Today is one grouped list, not a card per item. Progress shows four numbers; every analysis (retention, effort, practice time, the method comparison) is still there under "Details and experiments".
6. **Meaning is quiet**: a single line in the secondary text colour, hideable, never shown during recall.
7. **Nothing is removed.** Sound/Flow/Recall, part-by-part, cumulative joins, hints, lead-ins, ayah-by-ayah checking, flagging and repair, recording and the reference, progress and scheduling are unchanged underneath. Evidence rules are unchanged (see `REVISION_CHECKING.md`).

Checked at 320, 390 and 820 px, in light and dark (`e2e/refined-ui.spec.ts`, screenshots in `test-results/shots/ui-*.png`).
