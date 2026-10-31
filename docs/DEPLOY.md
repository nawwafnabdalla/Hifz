# Deploying Hifz OS from your iPhone

Everything below works in Safari on a phone. Three one-time steps, about ten minutes.

> The app is a static site. All logic runs in the browser; Supabase stores your history. Without Supabase configured the app still
> works fully on-device ("local-only"); signing in adds backup and multi-device sync.

## 1. Create the database tables (Supabase)

The Supabase project **`hifz-os`** already exists (ref `dfygzjfrkkrmmomwbtma`, region eu-central-1). It is empty until the migration runs.

**Option A (simplest on a phone):**
1. Open <https://supabase.com/dashboard/project/dfygzjfrkkrmmomwbtma/sql/new>.
2. In another tab open `supabase/migrations/20261031000001_core_schema.sql` on GitHub, tap **Raw**, select all, copy.
3. Paste into the SQL editor, tap **Run**. If asked about "destructive" statements (it contains `REVOKE`/`DELETE` in functions), confirm.
4. Optional but recommended: run `supabase/tests/rls.sql` the same way. It rolls back and prints `PASS` lines for RLS, immutability and constraints.

**Option B:** ask Claude to re-run the migration, and approve the confirmation prompt Supabase shows you.

## 2. Allow sign-in to return to your site (Supabase → Authentication)

After you have your Cloudflare URL (step 3):
* **Authentication → URL Configuration → Site URL**: your Pages URL, e.g. `https://hifz-os.pages.dev`.
* **Redirect URLs**: add the same URL (and `https://*.hifz-os.pages.dev` if you want preview deployments to sign in).
* **Authentication → Providers → Email**: for a personal app you may turn **Confirm email** off so sign-up logs you straight in.
  With it on, the confirmation link must open the same URL you configured above.

## 3. Deploy on Cloudflare Pages

1. Cloudflare dashboard → **Workers & Pages → Create → Pages → Connect to Git** → authorise GitHub → choose `nawwafnabdalla/Hifz`.
2. **Production branch:** `claude/hifz-os-feasibility-btrmfb` (or `main` once you merge). Other branches get automatic preview URLs.
3. **Build settings:**

   | Field | Value |
   |---|---|
   | Framework preset | None (or Vite) |
   | Build command | `npm run build` |
   | Build output directory | `dist` |
   | Root directory | *(leave blank)* |

4. **Environment variables** (Production and Preview):

   | Name | Value |
   |---|---|
   | `NODE_VERSION` | `22` |
   | `VITE_SUPABASE_URL` | `https://dfygzjfrkkrmmomwbtma.supabase.co` |
   | `VITE_SUPABASE_PUBLISHABLE_KEY` | the **publishable** key (starts `sb_publishable_`). Dashboard → Project Settings → API Keys. |

   The publishable key is designed to be public: it can only do what Row Level Security allows. **Never** use the `service_role`/secret key here.
5. **Save and Deploy.** First build takes ~1–2 minutes. Deep links (e.g. `/quran/2`) work because Pages serves `index.html` for unknown paths.

## 4. Install on your iPhone

Open the Pages URL in **Safari** → Share → **Add to Home Screen**. (iOS only installs PWAs from Safari.)

## 5. What to check on your phone (I could not test these)

- [ ] **Audio:** Settings → *Check audio on this device* shows "reachable" for at least one host; play an ayah in Learn → Sound.
- [ ] **Audio on the home-screen app:** play, lock the screen, return.
- [ ] **Sign up / sign in** and see "Synced" in Settings. Make a recall, tap Sync, then sign in on a second device.
- [ ] **Offline:** open the installed app, switch to Airplane mode, read a surah, do a recall; reconnect and check Settings shows 0 waiting.
- [ ] **Dark mode** and **Arabic size** look right under your usual lighting.
- [ ] **Add to Home Screen** icon and splash colour.
- [ ] After a redeploy, the app updates itself on the next open (service worker `autoUpdate`).

## Troubleshooting

| Symptom | Cause |
|---|---|
| Settings says "Cloud sync isn’t configured" | `VITE_*` variables missing at **build** time. Add them, then retry deployment. |
| "Check your email" but no email arrives | Supabase's built-in mailer is rate limited. Turn **Confirm email** off, or set up custom SMTP. |
| Sign-in works but sync says error / permission denied | The migration has not been applied (step 1). |
| Audio "could not load" for every host | Network or host outage; try another reciter. Hosts are third-party (see `docs/AUDIO.md`). |
| Old version after deploy | Close and reopen the app once; the service worker updates in the background. |
