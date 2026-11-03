# Review of the practice parts (for a qualified Qur'an reader)

**What is being reviewed.** Hifz OS breaks an ayah into short *practice parts* so a learner can memorise it a piece at a time and join the pieces. They are scaffolding. They are **not** waqf or ibtidāʾ rulings and the app says so on every part screen ("for learning, not places to stop"). Each break comes from one of: a sign printed in the mushaf; the reviewed list (`src/data/phrase-review.json`); the learner's own choice; or an **automatic preparation that nobody qualified has reviewed yet** (Arabic clause openers, a grammar model, and the English translation's clause structure; see `docs/MEANING_BREAKDOWN.md`). The review is for the last kind.

**What to look at (in this order)**
1. `data/review/meaning-boundaries-for-review.csv`: the 600 most doubtful breaks (columns: ayah, break after word N, why listed, the Arabic words on each side, the evidence). Two kinds: breaks made on weak evidence, and places where the translation suggests a break the Arabic does not support (no break is made there).
2. A sample of ayahs in the app: open an ayah → "Learn it part by part" and read the parts and the English meaning shown beside each (the English is a verbatim piece of the Saheeh translation).
3. Anything that looks wrong while using the app: a break that splits a construct, leaves a particle stranded, or separates what must be read together.

**How decisions are recorded.** For each ayah add to `src/data/phrase-review.json`: `"rejected": [N, …]` (these breaks are never used) and/or `"approved": [N, …]` (these may be used); N is the 0-based word after which the break falls; `"status": "reviewed"`, with the reviewer's name and date in `note`. The next release then shows that ayah as "reviewed". Rejections take effect immediately for everyone.

**Questions for the reviewer**
* Are there breaks that should never be offered, even for practice?
* Is it acceptable to present these as practice parts with the current wording?
* Does the English shown with a part match its Arabic?

*Status: no qualified reader has yet reviewed any of this. It has to be arranged by the owner; this document is the request pack.*
