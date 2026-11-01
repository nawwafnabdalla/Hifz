import { expect, test } from '@playwright/test'
import { freshStart, mockAudio, idbRows } from './helpers'

test.describe('Madinah Mushaf script', () => {
  test.beforeEach(async ({ page }) => { await mockAudio(page); await freshStart(page) })

  test('is the default, uses the official font and text, and can be switched off and back, persistently', async ({ page }) => {
    await page.goto('/quran/2?a=255')
    await expect.poll(() => page.evaluate(() => document.documentElement.dataset.script)).toBe('madinah')
    expect(await page.evaluate(() => document.fonts.check('1em "KFGQPC HAFS Uthmanic Script"', 'ࣰ'))).toBe(true)
    await page.getByRole('button', { name: 'Mushaf' }).click()
    const mushafText = await page.locator('span.ayah[data-ayah="255"]').first().innerText()
    expect(mushafText).toMatch(/[ࣰࣱࣲ]/)                       // the official open-tanween signs are in the DOM
    expect(await page.locator('.arabic').first().evaluate((e) => getComputedStyle(e).fontFamily)).toContain('KFGQPC HAFS Uthmanic Script')
    await page.locator('span.ayah[data-ayah="255"]').first().scrollIntoViewIfNeeded()
    await page.screenshot({ path: 'test-results/shots/50-mushaf-script.png' })

    await page.goto('/settings')
    await page.getByTestId('script-simple').click()
    await expect.poll(() => page.evaluate(() => document.documentElement.dataset.script)).toBe('simple')
    await page.goto('/quran/2?a=255')
    await page.getByRole('button', { name: 'Mushaf' }).click()
    const simple = await page.locator('span.ayah[data-ayah="255"]').first().innerText()
    expect(simple).not.toMatch(/[ࣰࣱࣲ]/)                          // canonical text, drawn in the simple script
    await page.reload()
    await expect.poll(() => page.evaluate(() => document.documentElement.dataset.script)).toBe('simple')   // persisted
    await page.goto('/settings'); await page.getByTestId('script-madinah').click()
    await expect.poll(() => page.evaluate(() => document.documentElement.dataset.script)).toBe('madinah')
  })

  test('the canonical words, not the drawn glyphs, drive hints, masks and the ladder', async ({ page }) => {
    await page.goto('/review/112/1/1?ctx=free')
    await expect(page.locator('.arabic .w')).toHaveCount(0)
    await page.getByTestId('hint').click()
    await expect(page.locator('.arabic .w')).toHaveCount(1)                       // exactly one word revealed, in the official script
    await page.screenshot({ path: 'test-results/shots/51-hint-madinah.png' })
    await page.goto('/learn/2/110/110')                                           // 17 words, three phrases: dimming applies
    await page.getByTestId('to-flow').click()
    await expect(page.getByTestId('stage-flow')).toBeVisible()
    await expect(page.locator('.arabic .w.dim').first()).toBeVisible()            // phrase dimming still works word by word
    await page.screenshot({ path: 'test-results/shots/52-ladder-madinah.png' })
  })

  test('Ta-Ha opens in the Madinah script and the Learn flow completes', async ({ page }) => {
    await page.goto('/learn/20/1/3')
    await expect(page.locator('html')).toHaveAttribute('data-script', 'madinah')
    await page.getByTestId('to-flow').click()
    for (let i = 0; i < 12 && (await page.getByTestId('learn-flow').getAttribute('data-stage')) === 'flow'; i++) {
      await page.getByTestId('said-it').click(); await page.getByTestId('rate-natural').click()
    }
    await page.getByTestId('reveal').click()
    await page.getByTestId('grade-independent').click()
    await expect(page.getByTestId('learn-flow')).toBeVisible()
    expect((await idbRows(page, 'reviews')).length).toBeGreaterThan(0)
  })

  test('the phrase editor, junction drill and saved passages draw in the same script', async ({ page }) => {
    await page.goto('/learn/2/255/255'); await page.getByTestId('to-flow').click()
    await page.getByTestId('advanced-toggle').click(); await page.getByTestId('edit-phrases').click()
    await expect(page.getByText(/not rulings on where to stop/)).toBeVisible()
    expect(await page.locator('.sheet .arabic .w').first().evaluate((e) => getComputedStyle(e).fontFamily)).toContain('KFGQPC')
  })
})

test.describe('reciter verification on the device', () => {
  test('one tap checks the three reciters and reports real results, with credits and links', async ({ page }) => {
    await freshStart(page)
    // Maher's EveryAyah folder serves audio; Yasser's does not; MP3Quran is unreachable. The report must say exactly that.
    const wav = (await import('./helpers')).silentWav()
    await page.route(/everyayah\.com\/data\/MaherAlMuaiqly128kbps\/.*\.mp3/, (r) => r.fulfill({ status: 200, contentType: 'audio/wav', body: wav, headers: { 'access-control-allow-origin': '*' } }))
    await page.route(/everyayah\.com\/data\/Yasser_Ad-Dussary_128kbps\/.*/, (r) => r.fulfill({ status: 404, body: 'not found' }))
    await page.route(/cdn\.islamic\.network/, (r) => r.abort('failed'))
    await page.route(/mp3quran\.net/, (r) => r.abort('failed'))
    await page.goto('/settings')
    await page.getByTestId('open-audio-sources').click()
    await page.getByTestId('run-reciter-check').click()
    const res = page.getByTestId('reciter-check-results')
    await expect(res).toBeVisible({ timeout: 90000 })
    await expect(res.locator('li').nth(0)).toContainText('Badr Al-Turki')
    await expect(res.locator('li').nth(0)).toContainText(/Verse by verse: No verse-by-verse source is known/)
    await expect(res.locator('li').nth(0)).toContainText(/MP3Quran catalogue/)
    await expect(res.locator('li').nth(1)).toContainText('Yasser Al-Dossary')
    await expect(res.locator('li').nth(1)).toContainText(/✗.*Verse by verse/s)
    await expect(res.locator('li').nth(2)).toContainText('Maher')
    await expect(res.locator('li').nth(2)).toContainText(/✓.*Played 20:1, 20:77, 20:135 via EveryAyah/s)
    await page.screenshot({ path: 'test-results/shots/53-reciter-check.png' })
    const credit = page.getByTestId('audio-credits').first()
    await expect(credit).toContainText(/recordings belong to the reciters/)
    await expect(credit.locator('a[href="https://everyayah.com"]')).toHaveCount(1)
  })
})

test('a slip repair is not followed by a second, duplicate repair prompt', async ({ page }) => {
  await mockAudio(page); await freshStart(page)
  await page.goto('/learn/2/255/255')
  await page.getByTestId('to-flow').click()
  const saidIt = page.getByTestId('said-it'), reveal = page.getByTestId('reveal')
  for (let i = 0; i < 40; i++) {                                                   // walk the ladder until the recall step shows
    await expect(saidIt.or(reveal)).toBeVisible()
    if (await reveal.isVisible()) break
    await saidIt.click(); await page.getByTestId('rate-natural').click()
  }
  await reveal.click()
  await page.locator('[data-word="12"]').click()
  await page.getByTestId('grade-prompted').click()
  await expect(page.getByTestId('repair-panel')).toBeVisible()
  await page.getByTestId('repair-skip').click()
  await expect(page.getByTestId('stage-repair')).toHaveCount(0)                    // no second "one more round" panel
  await expect(page.getByTestId('learn-flow')).toHaveAttribute('data-stage', 'done')
})
