# Phone validation checklist (starting Surah Ta-Ha)

Do these in order on the **installed home-screen app**. Each step says what you should see. If something differs, note the step number
and what happened; screenshots help. **Before you start:** Settings → Your data → *Export backup* (a safety copy).

Tell Claude when you reach steps 2 and 8. Claude can read your rows in the database (read-only) to confirm cloud storage is real.

## 1. Install
- Safari → your address → Share → Add to Home Screen → open from the icon.
- ✅ Opens full-screen with no Safari address bar; the "Today" screen shows.

## 2. Account and cloud storage
- Settings → Account & sync → email + password (8+ chars) → **Create account**.
- ✅ Your email appears with "Synced". If it says "check your email", confirm, then **Sign in**.
- Tell Claude: "signed in". Expected on the server: one `profiles` row after your first settings change.

## 3. Real audio
- Settings → Audio → **Check audio on this device**. ✅ At least one host says *reachable*.
- Qur'an → **Ta-Ha** → tap ayah 1 → **Listen** → play. ✅ You hear the recitation; the line under the reciter name shows which host served it.
- Try speed (0.75× / 1× / 1.25×), repeat count, and another reciter from the reciter name.
- If silent: raise volume, turn off Silent Mode, and note which host/reciter.

## 4. Set Ta-Ha as your goal
- Today → **Choose something to memorise** → Surah **20. Ta-Ha** → **Whole surah** → *Add goal*.
  (If you already know some of it: Today → *Mark more as known* → "A specific passage" → Ta-Ha, from–to.)
- ✅ Today shows a **New** item "Ta-Ha 1–…". Tap it: *Why this, today* explains the choice. The length is sized to your time budget.
- Ta-Ha 1 is a single word, so its flow is one step. Longer ayahs show a phrase chain (A → B → C…).

## 5. Learn an ayah
- **Begin session**. *Sound*: play the recitation. *Flow*: say it aloud, tap per repetition, rate it
  (Tangled / Improving / Natural). Try **Phrases** on a long ayah to see/edit practice breaks.
- *Recall*: say it from memory, **Show text**, tap how it went.
- ✅ After the last item you get a summary; nothing asks you to type.

## 6. Scheduling of the next revision
- Qur'an → Ta-Ha → tap the ayah you just recalled → **details**.
- ✅ **Next review** shows roughly 24 hours from now (a new, accurate recall is first rechecked after about a day). Estimated recall ~100%.
- Today shows "1 ayahs will fall due within a day" (or more, one per recalled ayah).
- **Tomorrow**: Today should list **Recent revision: Ta-Ha …** with "Last recalled successfully yesterday" and the estimated recall.
  Do it; the next review then moves further out (about 2 days, then 4…, only on successful recall).

## 7. Offline logging and reconnection
- With the app already opened once online, turn on **Airplane Mode**, then open the app.
- Read Ta-Ha. Do one recall (Qur'an → ayah → **Recall**). ✅ It saves; an amber dot appears on the Settings tab.
- Settings → Account shows "Offline. Changes are kept…" with N waiting.
- Turn Airplane Mode off, reopen the app. ✅ Within ~10 seconds it says Synced and 0 waiting.
- Tell Claude: "offline test done". Expected on the server: each event exactly once.
- (Audio does not work offline; text, planning and logging do.)

## 8. Two devices (optional)
- Sign in on another device/browser with the same account. ✅ Your history appears, with no duplicates.

## 9. Look and feel
- Dark mode (Settings → Appearance), Arabic size slider, translation on/off.
- Check the stop signs, small meem and rounded-zero signs in a few ayahs look like your mushaf; report any that look wrong.
  (See `docs/TEXT_REVIEW.md`.)

## Known limits to expect
- First launch must be online once (the app downloads itself). Audio always needs a connection.
- The scheduler uses default settings and says so; it does not yet learn your personal pace (it starts using your measured pace
  after 5 ayahs learned through the app).
- Password reset is not built yet. If you forget it, tell Claude.


## Next-leap checks on the phone (new)
- [ ] **Your reciters:** open a surah, Listen, tap the reciter name. Badr Al-Turki, Yasser Al-Dossary and Maher Al-Mu'aiqly are at the top. Pick each and press play.
  Note, for each: did a verse play (the dot turns green) or does it say it has no verse-by-verse recording?
- [ ] **Full surah:** for any reciter that says "no verse-by-verse", tap *Play the full surah*. Does it play?
- [ ] **Echo:** switch Echo on, play an ayah, recite in the pause. Try pause lengths and "Tap". Lock the screen mid-practice: does it carry on?
- [ ] **Hints:** in a recall, tap *Hint*, then *Show text*. "On my own" should be disabled.
- [ ] **Slip-to-repair:** after showing the text, tap the word you slipped on, grade, and practise the highlighted joint.
- [ ] **Letters:** open Ayat al-Kursi (2:255) and a few ayahs with tanween. No empty boxes anywhere?
- [ ] **Resume:** leave the app mid-learning and reopen. You should land on the same step.
