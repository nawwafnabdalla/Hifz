# Research review and the ramp experiment (rolled back)

**Decision (1 Nov 2026, the learner):** the "Said it" support ramp (commit 682a939) was tried on a real phone and did **not** feel more effective than the earlier Sound → Flow → Recall flow. It was reverted (commit 351b61b); the code is identical to release 167d9a3. Fewer taps is not the success metric: useful repetition, fluency feedback and the feeling of mastering an ayah matter more.

## Facts worth keeping from that investigation
* Phrase counts with the current conservative stop-sign rule: **71% of ayahs are one phrase, 21% two, 6% three, ~1.5% four or more.** Long multi-phrase ayahs are rare, which is why *phrase-level audio on long ayahs* (not tap reduction) is where the learning value is.
* The planner already opens sessions with recent revision, which is reviewed with the text hidden (a cold check).
* The ramp experiment is preserved in git history (682a939) if anyone wants to revisit it with evidence.

## Priorities (the learner's, in order)
1. Ease of learning difficult ayahs. 2. Fluency and pronunciation through repetition. 3. Independent recall. 4. Long-term retention. 5. Enjoyment and motivation. 6. Simplicity.
Remove only interaction that accomplishes nothing; do not remove repetition or feedback without evidence that the alternative works better.
