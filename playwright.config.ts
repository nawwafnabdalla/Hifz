import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  expect: { timeout: 8_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'retain-on-failure',
    launchOptions: { executablePath: process.env.PW_CHROMIUM ?? '/opt/pw-browsers/chromium', args: ['--no-sandbox'] },
  },
  projects: [
    { name: 'mobile', testIgnore: process.env.E2E_FLAG_OFF ? /cloud\.spec|phraseAudio|partsAudio|previewAccess|realAudio/ : /cloud\.spec/, use: { ...devices['Pixel 7'], viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 } },
    { name: 'cloud', testMatch: /cloud\.spec/, use: { ...devices['Pixel 7'], baseURL: 'http://localhost:4174', viewport: { width: 390, height: 844 } } },
  ],
  webServer: [
    { command: `${process.env.E2E_FLAG_OFF ? '' : 'VITE_PHRASE_AUDIO=1 VITE_TEST_CODE_SHA256=a69df5a64bd8863fa54119c85d6eff7773dc38d5f690cb05496f436e49bdd863 '}VITE_E2E=1 npm run build && npm run preview -- --port 4173`, url: 'http://localhost:4173', reuseExistingServer: false, timeout: 180_000 },
    {
      // A second build whose Supabase URL points at a hostname that the test intercepts.
      command: 'VITE_SUPABASE_URL=https://fake-hifz.supabase.test VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_fake npx vite build --outDir dist-cloud && npx vite preview --outDir dist-cloud --port 4174',
      url: 'http://localhost:4174', reuseExistingServer: false, timeout: 180_000,
    },
  ],
})
