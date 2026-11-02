// The private test code, exercised the way the owner meets it: on a Cloudflare-style preview address (a *.workers.dev host that is not the
// live app), in a build that has phrase audio, using the timings bundled in the app (not test hooks). The test build here carries the hash of "e2e-preview-code".
import { expect, test } from '@playwright/test'
import { mockAudio } from './helpers'

const HOST = 'claude-hifz-os-phrase-audio-hifz.example-account.workers.dev'
// *.dev addresses are https-only in Chromium, so the page is opened at https://<preview host>/ and every request to that host is answered
// by the local test server. The page therefore really runs on a Cloudflare-style secure origin.
test.use({ baseURL: `https://${HOST}` })
const LONG_TA_HA = '/learn/20/71/71'          // Maher: verified, 26 words, five parts

test.describe('phrase audio on a preview address', () => {
  test.beforeEach(async ({ page }) => {
    await page.route(`https://${HOST}/**`, async (route) => {
      const u = new URL(route.request().url())
      await route.fulfill({ response: await route.fetch({ url: `http://localhost:4173${u.pathname}${u.search}` }) })
    })
    await mockAudio(page)
    await page.goto('/'); await page.evaluate(() => localStorage.clear()); await page.reload()
    await page.goto('/settings')
    await page.getByLabel('Reciter').selectOption('maher')
  })

  test('locked until the code is entered: part-by-part still works, but no phrase audio is offered', async ({ page }) => {
    await expect(page.getByTestId('test-access')).toBeVisible()
    await page.goto(LONG_TA_HA)
    await expect(page.getByTestId('part-dots')).toBeVisible()
    await expect(page.getByTestId('no-phrase-audio')).toBeVisible()
    await expect(page.getByTestId('hear-part')).toHaveCount(0)
  })

  test('a wrong code is refused and changes nothing; the right one unlocks this device and survives a reload', async ({ page }) => {
    await page.getByTestId('test-code').fill('hifz-8b2d4e-f1a9c6')
    await page.getByTestId('test-unlock').click()
    await expect(page.getByText('That code isn’t right.')).toBeVisible()
    await page.goto(LONG_TA_HA)
    await expect(page.getByTestId('no-phrase-audio')).toBeVisible()
    await page.goto('/settings')
    await page.getByTestId('test-code').fill('  E2E-Preview-Code ')            // case and spaces do not matter
    await page.getByTestId('test-unlock').click()
    await expect(page.getByTestId('test-lock')).toBeVisible()                  // page reloaded; now unlocked
    await page.getByLabel('Reciter').selectOption('maher')
    await page.goto(LONG_TA_HA)
    await expect(page.getByTestId('part-dots')).toBeVisible()
    await expect(page.getByTestId('hear-part')).toBeVisible()                 // phrase audio for this part is offered
    await expect(page.getByTestId('no-phrase-audio')).toHaveCount(0)
    await page.reload()
    await expect(page.getByTestId('hear-part')).toBeVisible()                 // survives a reload
    await page.goto('/settings')
    await page.getByTestId('test-lock').click()                               // and can be switched off again
    await page.getByLabel('Reciter').selectOption('maher')
    await page.goto(LONG_TA_HA)
    await expect(page.getByTestId('no-phrase-audio')).toBeVisible()
  })
})
