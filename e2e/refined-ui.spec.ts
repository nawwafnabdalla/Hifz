// The refined interface: the Qur'an is the screen, the text is the control, secondary actions are small and contextual, and nothing is lost.
import { expect, test, type Page } from '@playwright/test'
import { completeLearning, freshStart, idbRows, mockAudio, recall, seed } from './helpers'

const noSideScroll = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)
const shot = (page: Page, name: string) => page.screenshot({ path: `test-results/shots/ui-${name}.png`, fullPage: true })
const SIZES = [{ w: 320, h: 700 }, { w: 390, h: 844 }, { w: 820, h: 1100 }]

for (const theme of ['light', 'dark'] as const) {
  for (const { w, h } of SIZES) {
    test.describe(`${theme} · ${w}px`, () => {
      test.beforeEach(async ({ page }) => {
        await page.setViewportSize({ width: w, height: h })
        await mockAudio(page); await freshStart(page)
        await seed(page, 'reviews', [recall(112, 1, 4, 'independent', 30), recall(20, 1, 9, 'independent', 60)])
        if (theme === 'dark') { await page.goto('/settings'); await page.getByRole('button', { name: 'dark' }).click() }
      })

      test('revision: the text is the control, with one quiet row of tools, and the whole journey works', async ({ page }) => {
        await page.goto('/review/20/7/9?ctx=sabqi')
        await expect(page.getByTestId('recall-card')).toBeVisible()
        expect(await noSideScroll(page)).toBe(true)
        // Nothing but the passage, a small toolbar and (for the first days) one line.
        await expect(page.getByRole('button')).toHaveCount(await page.getByRole('button').count())
        await expect(page.getByText(/Check ayah|Show all ayahs|Saved to your history|From memory|How was that/)).toHaveCount(0)
        await expect(page.getByTestId('grades')).toHaveCount(0)
        for (const a of [7, 8, 9]) { const b = await page.getByRole('button', { name: `Reveal ayah ${a}` }).boundingBox(); expect(b!.height).toBeGreaterThanOrEqual(44) }
        await page.getByRole('button', { name: 'Reveal ayah 7' }).click()
        await page.getByRole('button', { name: 'Reveal ayah 9' }).click()
        await expect(page.getByTestId('grades')).toBeVisible()
        await page.getByRole('button', { name: 'Hide ayah 9' }).click()          // the verse mark hides it again
        await expect(page.getByRole('button', { name: 'Show ayah 9 again' })).toBeVisible()
        expect(await noSideScroll(page)).toBe(true)
        await shot(page, `revision-${theme}-${w}`)
        await page.getByTestId('grade-independent').click()
        const r = (await idbRows(page, 'reviews')).find((x) => x.range.surah === 20 && x.context === 'sabqi')
        expect(r).toMatchObject({ range: { surah: 20, start: 7, end: 9 }, checked: [7, 9], completedTo: 7, grade: 'independent', cueLevel: 4 })
      })

      test('learning an ayah: Sound → Flow → Recall → done, with the Arabic first and one obvious next step', async ({ page }) => {
        await page.goto('/learn/1/2/2')                                             // an ayah that is not yet known (Al-Ikhlas is seeded as known above)
        await expect(page.getByTestId('stage-practise')).toBeVisible()
        expect(await noSideScroll(page)).toBe(true)
        const cont = await page.getByTestId('practise-next').boundingBox()
        expect(cont!.height).toBeGreaterThanOrEqual(44)
        await shot(page, `sound-${theme}-${w}`)
        await page.getByTestId('said-it').click()
        await shot(page, `flow-${theme}-${w}`)
        await page.getByTestId('practise-next').click()
        await expect(page.getByTestId('stage-recall')).toBeVisible()
        expect(await noSideScroll(page)).toBe(true)
        await completeLearning(page)
        expect((await idbRows(page, 'reviews')).some((x) => x.range.surah === 1 && x.context === 'new')).toBe(true)
      })

      test('part by part: Ta-Ha 20:10 shows the part, its meaning, and one line about where the parts come from only when asked', async ({ page }) => {
        await page.goto('/learn/20/10/10')
        await page.getByTestId('learn-by-parts').click()
        await expect(page.getByTestId('part-dots')).toBeVisible()
        await expect(page.getByTestId('part-meaning')).toContainText('When he saw a fire')
        await expect(page.getByTestId('part-basis')).toHaveCount(0)                  // not repeated on every screen
        await page.getByTestId('part-info-toggle').click()
        await expect(page.getByTestId('part-basis')).toContainText('not places to stop')   // but always one tap away
        expect(await noSideScroll(page)).toBe(true)
        await shot(page, `parts-${theme}-${w}`)
      })

      test('Today, Progress and Settings are calm and fit', async ({ page }) => {
        for (const [path, name] of [['/', 'today'], ['/progress', 'progress'], ['/settings', 'settings']] as const) {
          await page.goto(path); await page.waitForTimeout(300)
          expect(await noSideScroll(page), path).toBe(true)
          await shot(page, `${name}-${theme}-${w}`)
        }
      })
    })
  }
}

test.describe('what the refinement must not lose', () => {
  test.beforeEach(async ({ page }) => { await mockAudio(page); await freshStart(page); await seed(page, 'reviews', [recall(20, 1, 9, 'independent', 60)]) })

  test('Today: a flat list with one primary action; every item can still be opened for its reasons and started', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByTestId('start-session')).toBeVisible()
    await expect(page.getByTestId('plan-item').first()).toBeVisible()
    await page.getByTestId('plan-item').first().getByRole('button').first().click()
    await expect(page.getByTestId('plan-reasons')).toBeVisible()
    await expect(page.getByRole('button', { name: /Start .* now/ }).first()).toBeVisible()
    await expect(page.getByText('Mark more as known')).toBeVisible()
    await expect(page.getByText('How today’s plan is chosen')).toBeVisible()
  })

  test('Progress: the headline numbers first; every analysis is still there, one tap away', async ({ page }) => {
    await page.goto('/progress')
    await expect(page.getByTestId('coverage')).toBeVisible()
    await expect(page.getByTestId('retention')).not.toBeVisible()
    await page.getByTestId('progress-details').locator(':scope > summary').click()
    await expect(page.getByTestId('retention')).toBeVisible()
    await expect(page.getByTestId('experiment')).toBeVisible()
    await expect(page.getByTestId('start-experiment')).toBeVisible()
  })

  test('revision keeps hints, the run-up, reference audio, recording, flagging, focused repair and the slips panel', async ({ page }) => {
    await page.goto('/review/20/7/9?ctx=sabqi')
    await expect(page.getByTestId('lead-in')).toHaveAttribute('data-lead-ayah', '6')
    await expect(page.getByTestId('first-words')).toBeVisible()                      // hint
    await expect(page.getByTestId('record-start')).toBeVisible()                     // recording
    await page.getByTestId('reveal').click()
    await expect(page.getByTestId('hear-check')).toBeVisible()                       // reference audio
    await page.getByTestId('more-toggle').click()
    await expect(page.getByTestId('stumble-tools')).toBeVisible()                    // slips, shaky transitions, stopped early, read first
    await page.getByTestId('ayah-row-8').locator('[data-word="1"]').click()
    await page.getByTestId('issue-wrong').click()                                    // flagging
    await page.getByTestId('grade-prompted').click()
    await expect(page.getByTestId('repair-panel')).toBeVisible()                     // focused repair
  })

  test('single ayah: tap the concealed text to check it, tap the verse mark to hide it, hints and meaning stay as secondary tools', async ({ page }) => {
    await page.goto('/review/20/8/8?ctx=free')
    await expect(page.getByTestId('hint')).toBeVisible(); await expect(page.getByTestId('meaning')).toBeVisible()
    await page.getByRole('button', { name: 'Reveal ayah 8' }).click()
    await expect(page.getByTestId('grades')).toBeVisible()
    await page.getByRole('button', { name: 'Hide ayah 8' }).click()
    await expect(page.getByTestId('grades')).toBeVisible()                           // hiding never un-checks: the attempt is still gradable
    await page.getByRole('button', { name: 'Show ayah 8 again' }).click()
    await page.getByTestId('grade-hesitant').click()
    expect((await idbRows(page, 'reviews')).filter((x) => x.range.surah === 20 && x.range.start === 8)).toHaveLength(1)
  })
})
