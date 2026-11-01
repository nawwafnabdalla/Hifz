import { expect, test, type Page } from '@playwright/test'
import { freshStart, idbRows, mockAudio } from './helpers'

const taps = (page: Page) => page.evaluate(() => (window as unknown as { __taps: number }).__taps)

test.describe('the practice ramp', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => { (window as unknown as { __taps: number }).__taps = 0; document.addEventListener('click', (e) => { if (e.isTrusted) (window as unknown as { __taps: number }).__taps++ }, true) })
    await mockAudio(page); await freshStart(page)
  })

  test('an ordinary ayah is learned in about five taps, on one screen, with no stage names or counters', async ({ page }) => {
    await page.goto('/learn/20/2/2')                                              // one phrase, six words
    const before = await taps(page)
    await expect(page.getByTestId('stage-flow')).toBeVisible()
    await expect(page.getByRole('list', { name: 'Learning stages' })).toHaveCount(0)
    await expect(page.getByTestId('said-it')).toHaveCount(0)                      // no repetition counter
    await page.getByTestId('audio-play').click()                                  // 1: listen
    await expect(page.getByTestId('ramp-step')).toHaveAttribute('data-faded', 'false')
    await page.screenshot({ path: 'test-results/shots/69-ramp-first.png' })
    await page.getByTestId('ramp-next').click()                                   // 2: say it with the text
    await expect(page.getByTestId('ramp-step')).toHaveAttribute('data-faded', 'true')
    await expect(page.locator('.arabic .mask').first()).toBeVisible()             // the text has thinned to the first word
    await page.screenshot({ path: 'test-results/shots/70-ramp-faded.png' })
    await page.getByTestId('ramp-next').click()                                   // 3: say it from the first word
    await expect(page.getByTestId('stage-recall')).toBeVisible()
    await page.getByTestId('reveal').click()                                      // 4
    await page.getByTestId('grade-independent').click()                           // 5
    await expect(page.getByTestId('learn-flow')).toHaveAttribute('data-stage', 'done')
    expect((await taps(page)) - before).toBeLessThanOrEqual(5)
  })

  test('a three-piece ayah adds pieces one at a time while earlier ones thin out, then ends from first words', async ({ page }) => {
    await page.goto('/learn/2/110/110')
    const steps: number[] = []
    for (let i = 0; i < 12 && (await page.getByTestId('learn-flow').getAttribute('data-stage')) === 'flow'; i++) {
      steps.push(await page.locator('.arabic .mask').count())
      await page.getByTestId('ramp-next').click()
      await page.waitForTimeout(40)
    }
    expect(steps.length).toBeGreaterThanOrEqual(2)
    expect(steps[0]).toBe(0)                                                      // the first step shows everything in play
    expect(Math.max(...steps)).toBeGreaterThan(0)
    expect(steps.at(-1)).toBeGreaterThan(steps[0]!)                               // the last step is from first words only
    await expect(page.getByTestId('stage-recall')).toBeVisible()
    expect((await idbRows(page, 'flows')).every((f) => f.rating === 'natural')).toBe(true)
  })

  test('"Show me" reveals the text, is remembered as a tangle on that joint, and never touches memory evidence', async ({ page }) => {
    await page.goto('/learn/20/2/2')
    await page.getByTestId('ramp-next').click()
    await expect(page.locator('.arabic .mask').first()).toBeVisible()
    await page.getByTestId('ramp-peek').click()
    await expect(page.locator('.arabic .mask')).toHaveCount(0)
    await expect(page.getByTestId('ramp-peek')).toHaveCount(0)
    await page.getByTestId('ramp-next').click()
    await expect(page.getByTestId('stage-recall')).toBeVisible()
    const flows = await idbRows(page, 'flows')
    expect(flows.sort((a, b) => a.occurredAt - b.occurredAt).map((f) => f.rating)).toEqual(['natural', 'tangled'])
    expect(await idbRows(page, 'reviews')).toHaveLength(0)                        // flow never creates retention evidence
  })

  test('a very short ayah is said once with the text and goes straight to recall', async ({ page }) => {
    await page.goto('/learn/112/1/1')
    await page.getByTestId('ramp-next').click()
    await expect(page.getByTestId('stage-recall')).toBeVisible()
    await expect(page.getByTestId('ramp-peek')).toHaveCount(0)
  })

  test('a reload part-way through the ramp returns to the same step', async ({ page }) => {
    await page.goto('/learn/2/110/110')
    await page.getByTestId('ramp-next').click()
    const label = await page.locator('[data-testid="stage-flow"] .font-display').first().innerText()
    await page.reload()
    await expect(page.getByTestId('stage-flow')).toBeVisible()
    await expect(page.locator('[data-testid="stage-flow"] .font-display').first()).toHaveText(label)
  })

  test('positions saved by the old Sound screen still open on the practice step', async ({ page }) => {
    await page.evaluate(() => localStorage.setItem('hifz.learn.v1.112:1-4', JSON.stringify({ idx: 1, stage: 'sound', rungIdx: 0, listened: false, at: Date.now() })))
    await page.goto('/learn/112/1/4')
    await expect(page.getByTestId('learn-flow')).toHaveAttribute('data-stage', 'flow')
    await expect(page.getByText('ayah 2 of 4')).toBeVisible()
  })
})
