// Part-by-part learning is central to Hifz OS. These journeys must keep passing in every release (production build, no feature flags needed).
// iPhone-sized viewport (the 'mobile' project: 390 x 844, touch, mobile Chromium). Not real Safari.
import { expect, test, type Page } from '@playwright/test'
import { randomUUID } from 'node:crypto'
import { freshStart, idbRows, mockAudio, seed } from './helpers'

const TAHA10 = '/learn/20/10/10', AK = '/learn/2/255/255'
const stage = (page: Page) => page.getByTestId('learn-flow').getAttribute('data-stage')
const dots = (page: Page) => page.getByTestId('part-dots').locator('[data-secured]').evaluateAll((els) => els.map((e) => ({ secured: e.getAttribute('data-secured') === '1', current: e.getAttribute('data-current') === '1' })))
const layoutOf = async (page: Page, s: number, a: number) => { await page.waitForFunction(() => typeof (window as unknown as { __hifzPhrases?: unknown }).__hifzPhrases === 'function'); return layoutNow(page, s, a) }
const layoutNow = (page: Page, s: number, a: number) => page.evaluate(([s, a]) => (window as unknown as { __hifzPhrases: (s: number, a: number, p: unknown) => [number, number][] }).__hifzPhrases(s as number, a as number, []), [s, a] as const)
const shown = (page: Page) => page.locator('[data-testid="span-recall"] .arabic [data-w]').evaluateAll((els) => els.map((e) => Number(e.getAttribute('data-w'))))
async function toRecitation(page: Page) {
  const saidIt = page.getByTestId('said-it'), recite = page.getByTestId('span-recall'), whole = page.locator('[data-recall-kind="whole"]')
  if ((await stage(page)) === 'sound') await page.getByTestId('to-flow').click()
  for (let g = 0; g < 12; g++) {
    await expect(saidIt.or(recite).or(whole)).toBeVisible()
    if ((await recite.count()) || (await whole.count())) return
    await saidIt.click(); await page.getByTestId('rate-natural').click()
  }
}
const part = (surah: number, ayah: number, wordCount: number, from: number, to: number, ago: number) => ({ id: randomUUID(), surah, ayah, fromWord: from, toWord: to, wordCount, grade: 'independent', cueLevel: 4, durationMs: 9000, occurredAt: Date.now() - ago })

test.describe('part-by-part learning: the capability is present and complete', () => {
  test.beforeEach(async ({ page }) => { await mockAudio(page); await freshStart(page) })

  test('Ta-Ha 20:10, fresh: a clear "Learn it part by part" button, five parts with their meanings, hints, cumulative joins and a whole-ayah finish', async ({ page }) => {
    await page.goto(TAHA10)
    await expect(page.getByTestId('stage-sound')).toBeVisible()
    await expect(page.getByTestId('part-dots')).toHaveCount(0)                                            // an 18-word ayah opens in the ordinary Sound/Flow/Recall...
    await expect(page.getByTestId('learn-by-parts')).toContainText('Learn it part by part · 5 parts')    // ...with the capability one clear tap away
    await page.getByTestId('learn-by-parts').click()                                                     // and the tap takes you straight into the breakdown
    await expect(page.getByTestId('part-dots')).toBeVisible()
    expect(await dots(page)).toHaveLength(5)
    await page.getByTestId('part-info-toggle').click()
    await expect(page.getByTestId('part-basis')).toContainText('reviewed list')
    await expect(page.getByTestId('part-basis')).toContainText('not places to stop')
    const lay = await layoutOf(page, 20, 10)
    expect(lay).toEqual([[0, 2], [3, 5], [6, 8], [9, 12], [13, 17]])
    const meanings = ['When he saw a fire', 'and said to his family', 'indeed, I have perceived a fire', 'perhaps I can bring you a torch', 'or find at the fire some guidance']
    for (let p = 0; p < 4; p++) {
      await expect(page.getByTestId('part-caption')).toContainText(`Part ${String.fromCharCode(65 + p)}`)
      await expect(page.getByTestId('part-meaning')).toContainText(meanings[p]!)                         // the English matches its Arabic part
      await toRecitation(page)
      if (p > 0) await expect(page.getByTestId('span-recall')).toContainText(`A → ${String.fromCharCode(65 + p)}, from the beginning`)
      expect(await shown(page)).toEqual([])
      await page.getByTestId('span-hint').click()
      expect(await shown(page)).toEqual([lay[p]![0]])                                                      // the first word of THIS part (0, 3, 6, 9)
      await page.getByTestId('span-reveal').click(); await page.getByTestId('span-grade-hesitant').click()
      await expect(page.getByTestId('stage-partdone')).toBeVisible()
      if (p === 1) {                                                                                       // progress survives closing the app
        await page.getByTestId('finish-today').click()
        await page.goto(TAHA10)
        await expect(page.getByTestId('part-caption')).toContainText('Part C')
        expect((await dots(page)).slice(0, 2).every((d) => d.secured)).toBe(true)
        continue
      }
      await page.getByTestId('next-part').click()
    }
    await page.getByTestId('next-part').count()                                                            // (the loop ended on part D's join; continue to the last part)
    await expect(page.getByTestId('part-caption')).toContainText('Part E')
    await expect(page.getByTestId('part-meaning')).toContainText('or find at the fire some guidance')
    await toRecitation(page)
    await expect(page.locator('[data-recall-kind="whole"]')).toBeVisible()                                // the last step is the whole ayah, uninterrupted
    expect(await idbRows(page, 'reviews')).toHaveLength(0)                                                 // practice so far: nothing recorded as memorised
    await page.getByTestId('hint').click()
    expect(await page.locator('[data-testid="recall-card"] .arabic [data-w]').evaluateAll((els) => els.map((e) => Number(e.getAttribute('data-w'))))).toEqual([0])
    await page.getByTestId('reveal').click(); await page.getByTestId('grade-hesitant').click()
    await expect(page.getByTestId('stage-done')).toBeVisible()
    const reviews = await idbRows(page, 'reviews')
    expect(reviews).toHaveLength(1); expect(reviews[0]).toMatchObject({ context: 'new', range: { surah: 20, start: 10, end: 10 } })
    const parts = (await idbRows(page, 'parts')).sort((a, b) => a.occurredAt - b.occurredAt)
    expect(parts.every((x) => x.fromWord === 0)).toBe(true)                                                // always recited from the beginning
    expect(parts.map((x) => x.toWord)).toEqual([2, 5, 8, 12])
  })

  test('Ayat al-Kursi, fresh: opens part by part by default, with a way back to learning it whole, and the right hint for the second part', async ({ page }) => {
    await page.goto(AK)
    await expect(page.getByTestId('part-dots')).toBeVisible()
    expect((await dots(page)).length).toBeGreaterThanOrEqual(7)
    await expect(page.getByTestId('part-meaning')).toContainText('Allah - there is no deity')
    await expect(page.getByTestId('learn-whole')).toBeVisible()
    const lay = await layoutOf(page, 2, 255)
    await toRecitation(page); await page.getByTestId('span-reveal').click(); await page.getByTestId('span-grade-independent').click()
    await page.getByTestId('next-part').click()
    await toRecitation(page)
    await page.getByTestId('span-hint').click()
    expect(await shown(page)).toEqual([lay[1]![0]])
    expect(lay[1]![0]).toBeGreaterThan(0)
    await page.getByTestId('span-reveal').click()                                                          // a slip: only the joint is repaired, then back to the recitation
    await page.locator(`[data-testid="span-recall"] [data-word="${lay[1]![0]}"]`).click()
    await page.getByTestId('span-grade-prompted').click()
    await expect(page.getByTestId('stage-repair')).toContainText('A → B')
    await page.getByTestId('said-it').click(); await page.getByTestId('rate-natural').click()
    await expect(page.getByTestId('learn-flow')).toHaveAttribute('data-stage', 'recall')
  })
})

test.describe('part-by-part learning: existing learners and saved state', () => {
  test.beforeEach(async ({ page }) => { await mockAudio(page); await freshStart(page) })

  test('progress saved earlier is kept and resumed (Ayat al-Kursi, parts A–C already joined)', async ({ page }) => {
    await page.goto('/')
    await page.goto(AK)
    const lay = await layoutOf(page, 2, 255)
    await seed(page, 'parts', [part(2, 255, 50, 0, lay[0]![1], 3 * 3600e3), part(2, 255, 50, 0, lay[1]![1], 2.9 * 3600e3), part(2, 255, 50, 0, lay[2]![1], 2.8 * 3600e3)])
    await page.goto(AK)
    await expect(page.getByTestId('part-caption')).toContainText('Part D')
    expect((await dots(page)).slice(0, 3).every((d) => d.secured)).toBe(true)
  })

  test('a learner who chose to learn Ta-Ha 10 whole keeps that choice, and can switch to parts with one tap', async ({ page }) => {
    await page.goto('/')
    await seed(page, 'markers', [{ id: '20:10', surah: 20, ayah: 10, boundaries: [], source: 'user', updatedAt: Date.now() }])
    await page.goto(TAHA10)
    await expect(page.getByTestId('part-dots')).toHaveCount(0)
    await page.getByTestId('learn-phrases').click()
    await expect(page.getByTestId('part-dots')).toBeVisible()
  })

  test('a learner\'s own breaks are used as they are (four parts), and the screen says they are the learner\'s own', async ({ page }) => {
    await page.goto('/')
    await seed(page, 'markers', [{ id: '20:10', surah: 20, ayah: 10, boundaries: [5, 8, 12], source: 'user', updatedAt: Date.now() }])
    await page.goto(TAHA10)
    await expect(page.getByTestId('part-dots')).toBeVisible()
    expect(await dots(page)).toHaveLength(4)
    await page.getByTestId('part-info-toggle').click()
    await expect(page.getByTestId('part-basis')).toContainText('Your own breaks')
  })

  test('a Learn screen position saved by an older version (no part information) still opens cleanly', async ({ page }) => {
    await page.goto('/')
    await page.evaluate(() => localStorage.setItem('hifz.learn.v1.20:10-10', JSON.stringify({ idx: 0, stage: 'flow', rungIdx: 1, listened: true, at: Date.now() })))
    await page.goto(TAHA10)
    await expect(page.getByTestId('learn-flow')).toBeVisible()
    await expect(page.getByTestId('learn-by-parts').or(page.getByTestId('part-dots'))).toBeVisible()
  })

  test('revision of a part-learned ayah still begins with its run-up', async ({ page }) => {
    await page.goto('/review/20/10/10?ctx=sabqi')
    await expect(page.getByTestId('lead-in')).toHaveAttribute('data-lead-ayah', '9')
  })
})
