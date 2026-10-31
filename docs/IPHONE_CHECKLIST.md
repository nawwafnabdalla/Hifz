# iPhone validation after this release

**Verified on a real iPhone so far: nothing in this release.** The build environment has no device and cannot reach the audio hosts or your live site.
Everything below needs your confirmation. Tell me the result of each and I will fix what fails.

1. **Maher and Yasser, per-ayah audio.** Open any ayah → Listen → tap the reciter name → *Check my three reciters on this device* (about 30 s).
   Expected: for Yasser and Maher, “✓ Played 20:1, 20:77, 20:135 via EveryAyah”. If you see ✗, tell me the exact line.
   Then pick each, open Ta-Ha 1 and play: the dot beside the name turns green and the status line names the host.
2. **Badr Al-Turki.** In the same check, expect “Verse by verse: no source is known” and a Full-surah line. If ✓, use *Play the full surah* in the audio bar on a Ta-Ha screen. If ✗, send me the reason it shows.
3. **Echo.** Switch Echo on (it also sets 3 repeats). Play an ayah: listen, then “Your turn · Ns”, then it repeats. Try the audio settings (⚙): 1×, 1.5×, 2×, Tap. Lock the screen mid-pause: does it continue?
4. **Progressive hints.** In a recall tap *Hint* (first word), *Another hint*, *Meaning*. “On my own” should be disabled.
5. **Slip-to-repair.** After *Show text*, tap the word you slipped on, grade, practise the highlighted joint. Next time that ayah starts with the tricky part.
6. **Session resume.** Start learning, switch apps or close the app, reopen: same step. A half-finished recall comes back hidden, ungraded.
7. **Fajr scheduling.** Learn an ayah in the evening. Next morning at your usual time it should be in Today as “Recent revision”, with the reason “Due around this time today”, not a day later.
8. **Madinah script.** Open Ta-Ha and Ayat al-Kursi (Qur'an → Mushaf). You should see the printed Mushaf letterforms, brass end-of-ayah ornaments with numbers, and no empty boxes or detached marks. Check dark mode, text size, and the Flow ladder. Settings → Reading → Script lets you switch to Simple. Tell me anything that looks wrong, especially tanween and small signs.

## Offline audio (new)
9. **Save a goal's audio.** Create or open a goal (Maher or any reciter other than Yasser/Badr). Tap *Save audio*. Expect: a progress bar, then "Ready offline · N MB". If it says recordings couldn't be saved, tell me; it may mean the audio host blocks saving from the app (a cross-origin restriction I can't test from here).
10. **Play with no connection.** Turn on airplane mode, open the goal, press play: the line under the player should say "saved offline", and Echo and repeat should work. An ayah you didn't save should say you're offline and it isn't saved.
11. **Manage downloads.** Settings → Offline recitations: sizes shown, Remove audio works, your progress on Today is unchanged. (Compare the size with iPhone Settings → General → iPhone Storage → Hifz OS.)
12. **Yasser.** With Yasser as reciter the goal card should say he can be played but not saved, and offer Maher. This is deliberate: his source doesn't permit saving.
13. **Calm screens.** The audio bar should be one row; the Learn instruction should shorten after day three; nothing technical should appear on the main Settings page.
