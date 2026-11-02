# A private test version of Hifz OS (phrase audio) that cannot touch the real app

## Cloudflare previews: the cause and the fix (4 Nov 2026)
* **Cause (from the build log you found):** the non-production build ran `npm run build` successfully, then `npx wrangler preview` failed with *"Your Wrangler configuration is missing a `previews` block"*. Wrangler's own check requires the block, which may be empty.
* **Fix:** `wrangler.jsonc` (and `wrangler.test.jsonc`) now contain `"previews": {}`. An empty block means a preview inherits the assets and gets **no** extra variables, secrets or bindings. `wrangler deploy --dry-run` output for the live app is identical before and after.
* The Cloudflare docs host is not reachable from my sandbox, so the syntax comes from the installed Wrangler itself (4.156.2): its JSON schema defines a top-level `previews` object and its error text says the block can be empty.

## Why a preview cannot touch your real records or leak recordings
| Risk | Safeguard |
|---|---|
| Preview build carrying the live Supabase address/key (Workers Builds gives every branch the same project variables) | `vite.config.ts` reads the branch (`WORKERS_CI_BRANCH`): every branch except the live one is built with the Supabase address and key **blanked**, so the bundle contains neither (CI proves this). The live branch is built exactly as before. |
| Same, if the branch variable were ever missing or renamed | Second guard at run time: any `*.workers.dev` address other than `hifz.nawwaf-n-abdalla.workers.dev` never enables cloud sync (`isPreviewHost`). A preview's address is such a host. |
| Phrase audio (flag) on in production | The flag is switched on **only** when the branch being built is `claude/hifz-os-phrase-audio`. The live branch is never flagged; a flag-off build bundles no phrase data (CI proves it). |
| Anyone with the preview link streaming rights-uncleared recordings | In a build that has phrase audio, nothing loads (no timings, no phrase controls, no recording request) on a preview address until you enter the **private test code** once on that device (Settings → Test access). Only a hash of the code is in the app. This is a guard against casual use of an open link; for real privacy also turn on Cloudflare Access for preview URLs (Worker → Settings → Domains & Routes → Preview URLs). |
| Confusing the apps | Preview title "Hifz OS (test)", home-screen name "Hifz test". |
Remaining caveat: the preview still streams from `audio-cdn.tarteel.ai` into **your** browser once unlocked; rights for that are not cleared (`PHRASE_AUDIO_RIGHTS.md`), which is why the code gate exists.
Also note: the branch name that sets all this is read from `WORKERS_CI_BRANCH`. I could not read Cloudflare's docs to confirm the variable name; the build prints one line `[hifz] building branch "…": …` so the next build log shows whether it was seen. If it is not seen, the run-time guard above still protects your data, and phrase audio would simply be off (safe).

## The working test version: a second, separate Worker
It deploys the way production already deploys (which works), but to its own Worker, so it cannot replace the live app.
1. Cloudflare → Workers & Pages → **Create** → **Import a repository** (connect GitHub) → `nawwafnabdalla/Hifz`.
2. Project name: **hifz-test** (must equal the name in `wrangler.test.jsonc`).
3. Production branch: **claude/hifz-os-phrase-audio**.
4. Build command: `VITE_PHRASE_AUDIO=1 npm run build`
   Deploy command: `npx wrangler deploy -c wrangler.test.jsonc`
   Root directory: empty. **Add no variables** (in particular none of the Supabase ones).
5. Save and deploy. The address is `https://hifz-test.<your-workers-subdomain>.workers.dev`.
6. **Make it private** (recommended, and required while audio rights are open): Worker **hifz-test** → Settings → Domains & Routes → *workers.dev* → **Enable Cloudflare Access**, policy "Emails: your address". Only you can then open it. Preview URLs are off in `wrangler.test.jsonc`.
7. iPhone: open it in Safari, sign in through Access, Share → **Add to Home Screen** (it is named "Hifz test", distinct from "Hifz").

## Why it cannot hurt the real app or its data
| Risk | Safeguard |
|---|---|
| Overwriting the live Worker | Different Worker name (`hifz-test`) and its own project; the live project (`hifz`, production branch `claude/hifz-os-feasibility-btrmfb`) is untouched. |
| Reading or changing your real records on the phone | A different origin has its own, empty on-device database and service worker. |
| Writing to the cloud (Supabase) | The test build refuses to use the cloud even if variables are present (`TEST_BUILD` in `src/lib/store/remote.ts`), and none are configured. |
| Public exposure of unreleased audio features | Access-protected; an ordinary build (including any preview of this branch by the live project) bundles no phrase data (CI checks this). |
| Confusing the two apps | Title "Hifz OS (test)", home-screen name "Hifz test". |
Note: playing audio still streams from `audio-cdn.tarteel.ai` into your own browser (nothing is copied or hosted by us). Tarteel's guidance is not to hotlink that CDN in production; see `PHRASE_AUDIO_RIGHTS.md`. This test is one private user, which is why it stays behind Access.

## `wrangler preview` (Cloudflare's newer isolated previews)
`wrangler preview` (open beta in wrangler 4.156) creates a named preview of a Worker with separate secrets and a shared base config. It needs `CLOUDFLARE_API_TOKEN`, so I could not run it here, and it does not give you a dashboard-only iPhone workflow. It could later be set as the *non-production branch deploy command* in the live project. The separate-Worker route above is simpler and fully tested in its parts (build, config validation, data isolation), but **not yet deployed**: creating the project needs your Cloudflare dashboard.
