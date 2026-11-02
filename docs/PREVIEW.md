# A private test version of Hifz OS (phrase audio) that cannot touch the real app

## What was wrong with Cloudflare previews (found from the GitHub checks, no log needed)
* Every build of a **non-production branch fails**, including the unchanged `claude/hifz-os-rollback` branch (1c57bc6, 1 Nov 12:59:32 → failed 13:00:12). The same commit then **succeeded** when it reached the production branch (13:04:38 → 13:05:11). Builds run 30–70 s in both cases.
* So the cause is Cloudflare project configuration for non-production builds (the "Non-production branch deploy command", i.e. the step after the build), **not our code, dependencies or assets**. Checked: a clean clone builds in 3 s and `wrangler deploy --dry-run` accepts the config and reads all 40 files.
* The exact message is only in the build log (the GitHub check carries no text). To read it on an iPhone: Safari → dash.cloudflare.com → **Workers & Pages** → **hifz** → **Deployments** (or **Settings → Builds → Build history**) → tap a build marked failed → **Logs**. Or open GitHub → the commit → the check "Workers Builds: hifz" → **Details** (e.g. `https://dash.cloudflare.com/a233a6c5d3a72cf35dbd667b877fb138/workers/services/view/hifz/production/builds/04b25944-80f1-4d34-98b4-8b2a37743a56`). Paste the last 20 lines to me and I will name the setting. Likely suspects: the non-production deploy command is empty/invalid (default is `npx wrangler versions upload`), or Preview URLs are not enabled for the Worker.
* I changed nothing in the production project. Optional tidy-up there: Settings → Builds → Branch control → turn off "Builds for non-production branches" (stops the failing noise).

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
