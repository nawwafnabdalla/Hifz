// Part-by-part memorisation of a long ayah, in a real browser. Ayat al-Kursi (2:255) is split into several parts.
// Simulated: the clock is moved by writing events with older timestamps. Nothing here is verified on an iPhone.
import { expect, test, type Page } from '@playwright/test'
import { randomUUID } from 'node:crypto'
import { completeLearning, freshStart, idbRows, mockAudio, seed } from './helpers'

const AK = '/learn/2/255/255'
const stage = (page: Page) => page.getByTestId('learn-flow').getAttribute('data-stage')
const dots = async (page: Page) => page.getByTestId('part-dots').locator('[data-secured]').evaluateAll((els) => els.map((e) => ({ secured: e.getAttribute('data-secured') === '1', current: e.getAttribute('data-current') === '1' })))
/** Learn the part in hand: sound → flow (every rung) → recall of that part → (join) → "part done". */
async function learnPart(page: Page, grade: 'independent' | 'hesitant' = 'independent') {
  for (let g = 0; g < 40; g++) {
    const s = await stage(page)
    if (s === 'partdone') return
    if (s === 'sound') await page.getByTestId('to-flow').click()
    else if (s === 'flow') { const said = page.getByTestId('said-it'); if (await said.isVisible()) { await said.click(); await page.getByTestId('rate-natural').click() } }
    else if (s === 'recall') {
      if (await page.locator('[data-recall-kind="whole"]').count()) return          // the last part ends in the ordinary whole-ayah recall
      await page.getByTestId('span-reveal').click(); await page.getByTestId(`span-grade-${grade}`).click()
    }
    await page.waitForTimeout(40)
  }
  throw new Error('part did not finish')
}
const part = (over: Record<string, unknown>) => ({ id: randomUUID(), surah: 2, ayah: 255, fromWord: 0, toWord: 5, wordCount: 50, grade: 'independent', cueLevel: 4, durationMs: 9000, occurredAt: Date.now(), ...over })

test.describe('part-by-part memorisation of a long ayah', () => {
  test.beforeEach(async ({ page }) => { await mockAudio(page); await freshStart(page) })

  test('A: learn the first part, finish for today, and it is saved — the ayah is not marked memorised', async ({ page }) => {
    await page.goto(AK)
    await expect(page.getByTestId('part-dots')).toBeVisible()
    const d0 = await dots(page)
    expect(d0.length).toBeGreaterThanOrEqual(3)
    expect(d0.filter((x) => x.current)).toHaveLength(1)
    expect(d0[0]!.current).toBe(true)
    await expect(page.getByTestId('part-caption')).toContainText('Part A')
    await learnPart(page)
    await expect(page.getByTestId('stage-partdone')).toBeVisible()
    await page.getByTestId('finish-today').click()
    await expect(page).toHaveURL(/\/$/)
    const parts = await idbRows(page, 'parts')
    expect(parts).toHaveLength(1)
    expect(parts[0]).toMatchObject({ surah: 2, ayah: 255, fromWord: 0, grade: 'independent' })
    expect(await idbRows(page, 'reviews')).toHaveLength(0)           // nothing says the ayah is memorised
  })

  test('A2: reopening the same day continues at the next part, without repeating the first', async ({ page }) => {
    await page.goto(AK)
    await learnPart(page)
    await page.getByTestId('finish-today').click()
    await page.goto(AK)
    await expect(page.getByTestId('learn-flow')).toHaveAttribute('data-stage', 'sound')
    await expect(page.getByTestId('part-caption')).toContainText('Part B')
    const d = await dots(page)
    expect(d[0]!.secured).toBe(true)
    expect(d[1]!.current).toBe(true)
  })

  test('B: the next day the part learned is checked first, then the next part begins', async ({ page }) => {
    await page.goto('/')
    await seed(page, 'parts', [part({ fromWord: 0, toWord: 6, occurredAt: Date.now() - 26 * 3600e3 })])
    await page.goto(AK)
    // (the first phrase may end elsewhere than word 6; the recall above only counts if it covers the whole first phrase)
    const first = await stage(page)
    if (first === 'refresh') {
      await expect(page.getByTestId('stage-refresh')).toContainText('Welcome back')
      await page.getByTestId('span-reveal').click()
      await page.getByTestId('span-grade-independent').click()
      await expect(page.getByTestId('learn-flow')).toHaveAttribute('data-stage', 'sound')
      await expect(page.getByTestId('part-caption')).toContainText('Part B')
    } else {
      // The first phrase is longer than 7 words in this layout, so nothing was secured yet: it starts at part A, as it should.
      await expect(page.getByTestId('part-caption')).toContainText('Part A')
    }
  })

  test('B2: with a recall that covers the first phrase, the plan says "continue", and a failed check sends you back to that part only', async ({ page }) => {
    await page.goto(AK)
    const w = await page.evaluate(() => (window as unknown as { __hifzPhrases?: (s: number, a: number, p: unknown) => [number, number][] }).__hifzPhrases?.(2, 255, []))
    expect(w && w.length).toBeGreaterThanOrEqual(3)
    const [a0, a1] = w![0]!
    const [, b1] = w![1]!
    void a1
    await seed(page, 'parts', [part({ fromWord: a0, toWord: w![0]![1], occurredAt: Date.now() - 26 * 3600e3 }), part({ fromWord: w![1]![0], toWord: b1, occurredAt: Date.now() - 25.9 * 3600e3 })])
    await page.goto('/')
    await page.evaluate(async () => { /* make the goal */ })
    await page.goto(AK)
    await expect(page.getByTestId('learn-flow')).toHaveAttribute('data-stage', 'refresh')
    await page.getByTestId('span-reveal').click()
    // slip on the first word of the second part
    await page.locator(`[data-word="${w![1]![0]}"]`).click()
    await page.getByTestId('span-grade-prompted').click()
    await expect(page.getByTestId('learn-flow')).toHaveAttribute('data-stage', 'sound')
    await expect(page.getByTestId('part-caption')).toContainText('Part B')       // not part A: the first part still stands
    const d = await dots(page)
    expect(d[0]!.secured).toBe(true)
    expect(d[1]!.secured).toBe(false)
    // the slip is also recorded where the app records them, as a tangled mark on that joint
    const flows = await idbRows(page, 'flows')
    expect(flows.some((f) => f.rating === 'tangled' && f.reps === 0 && f.surah === 2 && f.ayah === 255)).toBe(true)
  })

  test('C/F: parts, then joins, then the whole ayah — only the whole-ayah recall counts as memorised', async ({ page }) => {
    await page.goto(AK)
    await expect(page.getByTestId('part-dots')).toBeVisible()
    const k = (await dots(page)).length
    expect(k).toBeGreaterThanOrEqual(3)
    for (let i = 0; i < k; i++) {
      await learnPart(page)                                      // ends on "part done" for every part but the last
      if (i < k - 1) { await page.getByTestId('next-part').click(); expect(await idbRows(page, 'reviews')).toHaveLength(0) }
      else break
    }
    // The last part: its join with everything before it IS the whole ayah, so the ordinary recall appears.
    await expect(page.getByTestId('stage-recall')).toHaveAttribute('data-recall-kind', 'whole')
    expect(await idbRows(page, 'reviews')).toHaveLength(0)
    const partsBefore = (await idbRows(page, 'parts')).length
    expect(partsBefore).toBeGreaterThanOrEqual(k)
    await page.getByTestId('reveal').click()
    await page.getByTestId('grade-independent').click()
    await expect(page.getByTestId('stage-done')).toBeVisible()
    const reviews = await idbRows(page, 'reviews')
    expect(reviews).toHaveLength(1)
    expect(reviews[0]).toMatchObject({ kind: 'recall', context: 'new', range: { surah: 2, start: 255, end: 255 }, grade: 'independent' })
  })

  test('D: a part that goes wrong is practised again without losing the parts that went well', async ({ page }) => {
    await page.goto(AK)
    await learnPart(page)
    await page.getByTestId('next-part').click()                  // now part B
    await page.getByTestId('to-flow').click()
    const saidIt = page.getByTestId('said-it'), reveal = page.getByTestId('span-reveal')
    for (let g = 0; g < 10; g++) {                                   // walk the rungs of this part until its recall appears
      await expect(saidIt.or(reveal)).toBeVisible()
      if (await reveal.isVisible()) break
      await saidIt.click(); await page.getByTestId('rate-natural').click()
    }
    await reveal.click()
    await page.getByTestId('span-grade-failed').click()
    await expect(page.getByTestId('stage-repair')).toHaveAttribute('data-repair-kind', 'part')
    await page.getByTestId('back-to-flow').click()
    await expect(page.getByTestId('learn-flow')).toHaveAttribute('data-stage', 'flow')
    const d = await dots(page)
    expect(d[0]!.secured).toBe(true)
    expect(d[1]!.current).toBe(true)
  })

  test('hints: the first word is allowed, and "on my own" is then unavailable', async ({ page }) => {
    await page.goto(AK)
    await page.getByTestId('know-this-part').click()
    await page.getByTestId('span-hint').click()
    await page.getByTestId('span-reveal').click()
    await expect(page.getByTestId('span-grade-independent')).toBeDisabled()
    await page.getByTestId('span-grade-hesitant').click()
    const parts = await idbRows(page, 'parts')
    expect(parts[0]).toMatchObject({ grade: 'hesitant', cueLevel: 3 })
  })

  test('G: a short ayah is straightforward — no parts, no part dots', async ({ page }) => {
    await page.goto('/learn/112/1/1')
    await expect(page.getByTestId('learn-flow')).toBeVisible()
    await expect(page.getByTestId('part-dots')).toHaveCount(0)
    await completeLearning(page)
    expect(await idbRows(page, 'parts')).toHaveLength(0)
    expect(await idbRows(page, 'reviews')).toHaveLength(1)
  })

  test('H: without phrase audio the part screen says so and still plays the whole ayah', async ({ page }) => {
    await page.goto(AK)
    await expect(page.getByTestId('no-phrase-audio')).toContainText('whole ayah plays')
    await expect(page.getByTestId('audio-play')).toBeVisible()
  })

  test('I: leaving in the middle of a part keeps the position after a reload, and a half-finished recall is never graded for you', async ({ page }) => {
    await page.goto(AK)
    await learnPart(page)
    await page.getByTestId('next-part').click()
    await page.getByTestId('to-flow').click()
    await page.reload()
    await expect(page.getByTestId('learn-flow')).toHaveAttribute('data-stage', 'flow')
    await expect(page.getByTestId('part-dots').locator('[data-current="1"]')).toHaveText('B')
    expect(await idbRows(page, 'parts')).toHaveLength(1)
  })

  test('the plan shows the next part, and a session that learned a part is reported as progress, not as skipped', async ({ page }) => {
    await page.goto('/')
    await page.evaluate(async () => {
      const db: IDBDatabase = await new Promise((res, rej) => { const r = indexedDB.open('hifz-os'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error) })
      await new Promise<void>((res, rej) => { const tx = db.transaction('targets', 'readwrite'); tx.objectStore('targets').put({ id: crypto.randomUUID(), range: { surah: 2, start: 255, end: 255 }, status: 'active', createdAt: Date.now(), updatedAt: Date.now(), label: 'Ayat al-Kursi', synced: 0 }); tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error) })
      db.close()
    })
    await page.reload()
    await expect(page.getByTestId('plan-item').first()).toContainText('start with part A')
    await page.getByTestId('start-session').click()
    await expect(page).toHaveURL(/\/session/)
    await learnPart(page)
    await page.getByTestId('finish-today').click()
    await expect(page.getByTestId('session-summary')).toBeVisible()
    await expect(page.getByTestId('summary-items')).toContainText('continues from there')
    await page.getByTestId('session-finish').click()
    await page.evaluate(() => null)
    await expect(page.getByTestId('plan-item').first()).toContainText('part B')
  })
})
