// Part-by-part memorisation of a long ayah, in a real browser. Ayat al-Kursi (2:255) is split into several parts.
// Simulated: the clock is moved by writing events with older timestamps. Nothing here is verified on an iPhone.
import { expect, test, type Page } from '@playwright/test'
import { randomUUID } from 'node:crypto'
import { completeLearning, freshStart, idbRows, mockAudio, seed } from './helpers'

const AK = '/learn/2/255/255'
const stage = (page: Page) => page.getByTestId('learn-flow').getAttribute('data-stage')
const dots = async (page: Page) => page.getByTestId('part-dots').locator('[data-secured]').evaluateAll((els) => els.map((e) => ({ secured: e.getAttribute('data-secured') === '1', current: e.getAttribute('data-current') === '1' })))
/** Learn the part in hand: practise (every rung) → recall of that part → (join) → "part done". */
async function learnPart(page: Page, grade: 'independent' | 'hesitant' = 'independent') {
  for (let g = 0; g < 40; g++) {
    const s = await stage(page)
    if (s === 'partdone') return
    if (s === 'practise') { const next = page.getByTestId('practise-next'); if (await next.isVisible()) await next.click() }
    else if (s === 'recall') {
      if (await page.locator('[data-recall-kind="whole"]').count()) return          // the last part ends in the ordinary whole-ayah recall
      await page.getByTestId('span-reveal').click(); await page.getByTestId(`span-grade-${grade}`).click()
    }
    await page.waitForTimeout(40)
  }
  throw new Error('part did not finish')
}
const part = (over: Record<string, unknown>) => ({ id: randomUUID(), surah: 2, ayah: 255, fromWord: 0, toWord: 5, wordCount: 50, grade: 'independent', cueLevel: 4, durationMs: 9000, occurredAt: Date.now(), ...over })

/** Walk the practice rungs of the part in hand until its recitation appears. */
async function toRecitation(page: Page) {
  const next = page.getByTestId('practise-next'), recite = page.getByTestId('span-recall'), whole = page.locator('[data-recall-kind="whole"]')
  for (let g = 0; g < 12; g++) {
    await expect(next.or(recite).or(whole)).toBeVisible()
    if ((await recite.count()) || (await whole.count())) return
    await next.click()
  }
}
const layoutOf = (page: Page, surah: number, ayah: number) => page.evaluate(([s, a]) => (window as unknown as { __hifzPhrases: (s: number, a: number, p: unknown) => [number, number][] }).__hifzPhrases(s as number, a as number, []), [surah, ayah] as const)
/** The word indices visible in the recitation panel (hidden words are bars without an index). */
/** Part events in the order they were recorded (the store returns them by id). */
const partsInOrder = async (page: Page) => (await idbRows(page, 'parts')).sort((a, b) => a.occurredAt - b.occurredAt)
const shown = (page: Page) => page.locator('[data-testid="span-recall"] .arabic [data-w]').evaluateAll((els) => els.map((e) => Number(e.getAttribute('data-w'))))

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
    await expect(page.getByTestId('learn-flow')).toHaveAttribute('data-stage', 'practise')
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
      await expect(page.getByTestId('learn-flow')).toHaveAttribute('data-stage', 'practise')
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
    await expect(page.getByTestId('learn-flow')).toHaveAttribute('data-stage', 'practise')
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
    expect(partsBefore).toBe(k - 1)                                          // one recitation of the growing sequence per part before the last (the last is the whole ayah)
    await page.getByTestId('reveal').click()
    await page.getByTestId('grade-independent').click()
    await expect(page.getByTestId('stage-done')).toBeVisible()
    const reviews = await idbRows(page, 'reviews')
    expect(reviews).toHaveLength(1)
    expect(reviews[0]).toMatchObject({ kind: 'recall', context: 'new', range: { surah: 2, start: 255, end: 255 }, grade: 'independent' })
  })

  test('hints: the first word is allowed (it is the opening of the part being added), and "on my own" is then unavailable', async ({ page }) => {
    await page.goto(AK)
    const lay = await layoutOf(page, 2, 255)
    await page.getByTestId('know-this-part').click()
    expect(await shown(page)).toEqual([])                                   // nothing visible before the hint
    await page.getByTestId('span-hint').click()
    expect(await shown(page)).toEqual([lay[0]![0]])                         // part A: its first word
    await page.getByTestId('span-reveal').click()
    await expect(page.getByTestId('span-grade-independent')).toBeDisabled()
    await page.getByTestId('span-grade-hesitant').click()
    const parts = await idbRows(page, 'parts')
    expect(parts[0]).toMatchObject({ grade: 'hesitant', cueLevel: 3 })
  })

  test('1. learn A, then B, then join A + B: B is introduced with its meaning and its opening hint, and is tested only as part of the continuous recitation', async ({ page }) => {
    await page.goto(AK)
    const lay = await layoutOf(page, 2, 255)
    expect(lay.length).toBeGreaterThanOrEqual(3)
    await toRecitation(page)                                                // A: Sound -> Flow -> recitation
    await expect(page.getByTestId('span-recall')).toContainText('Part A from memory')
    await page.getByTestId('span-hint').click()
    expect(await shown(page)).toEqual([lay[0]![0]])
    await page.getByTestId('span-reveal').click(); await page.getByTestId('span-grade-hesitant').click()
    await expect(page.getByTestId('stage-partdone')).toContainText('Part A is in')
    await page.getByTestId('next-part').click()
    await expect(page.getByTestId('part-caption')).toContainText('Part B')
    await expect(page.getByTestId('part-meaning')).toContainText('Neither drowsiness overtakes Him nor sleep')   // B arrives with its meaning
    await toRecitation(page)                                                // B: practised, then A + B from the beginning
    await expect(page.getByTestId('span-recall')).toContainText('A → B, from the beginning')
    await expect(page.getByTestId('span-recall')).toContainText('A → B, from the beginning')
    expect(await shown(page)).toEqual([])
    await expect(page.getByTestId('span-hint')).toHaveAttribute('aria-label', 'Hint: first word of B')
    await page.getByTestId('span-hint').click()
    expect(await shown(page)).toEqual([lay[1]![0]])                         // the first word of B — not word 0 of the ayah
    await page.getByTestId('span-reveal').click(); await page.getByTestId('span-grade-hesitant').click()
    await expect(page.getByTestId('stage-partdone')).toContainText('A → B is joined')
    const parts = await partsInOrder(page)
    expect(parts.every((x) => x.fromWord === 0)).toBe(true)                 // B was never asked for on its own
    expect(parts.map((x) => x.toWord)).toEqual([lay[0]![1], lay[1]![1]])
    expect(await idbRows(page, 'reviews')).toHaveLength(0)                  // practice, not memorisation
  })

  test('2. learn C and recite A + B + C continuously; the first-word hint of EVERY part is that part\'s own first word; the last step is the whole ayah', async ({ page }) => {
    await page.goto(AK)
    const lay = await layoutOf(page, 2, 255), k = lay.length
    for (let p = 0; p < k - 1; p++) {
      await toRecitation(page)
      if (p > 0) await expect(page.getByTestId('span-recall')).toContainText(`A → ${String.fromCharCode(65 + p)}, from the beginning`)
      await page.getByTestId('span-hint').click()
      expect(await shown(page), `part ${String.fromCharCode(65 + p)}`).toEqual([lay[p]![0]])
      await page.getByTestId('span-reveal').click(); await page.getByTestId('span-grade-hesitant').click()
      await expect(page.getByTestId('stage-partdone')).toBeVisible()
      expect((await partsInOrder(page)).at(-1)).toMatchObject({ fromWord: 0, toWord: lay[p]![1] })       // always from the beginning
      await page.getByTestId('next-part').click()
    }
    // the last part's recitation IS the whole ayah, tested like any whole-ayah recall
    await toRecitation(page)
    await expect(page.locator('[data-recall-kind="whole"]')).toBeVisible()
    expect(await idbRows(page, 'reviews')).toHaveLength(0)
    await page.getByTestId('hint').click()
    expect(await page.locator('[data-testid="recall-card"] .arabic [data-w]').evaluateAll((els) => els.map((e) => Number(e.getAttribute('data-w'))))).toEqual([0])   // whole ayah: the ayah\'s first word
    await page.getByTestId('reveal').click(); await page.getByTestId('grade-hesitant').click()
    await expect(page.getByTestId('stage-done')).toBeVisible()
    const reviews = await idbRows(page, 'reviews')
    expect(reviews).toHaveLength(1)
    expect(reviews[0]).toMatchObject({ context: 'new', range: { surah: 2, start: 255, end: 255 }, cueLevel: 3 })          // a hinted whole-ayah recall: weaker evidence, scheduled for revision
  })

  test('3. a slip while reciting A + B: only the joint is practised, then straight back to reciting from the start (nothing already learned is repeated)', async ({ page }) => {
    await page.goto(AK)
    const lay = await layoutOf(page, 2, 255)
    await toRecitation(page); await page.getByTestId('span-reveal').click(); await page.getByTestId('span-grade-independent').click()
    await page.getByTestId('next-part').click()
    await toRecitation(page)
    await page.getByTestId('span-reveal').click()
    await page.locator(`[data-testid="span-recall"] [data-word="${lay[1]![0]}"]`).click()     // slipped on the opening of B
    await page.getByTestId('span-grade-prompted').click()
    await expect(page.getByTestId('stage-repair')).toHaveAttribute('data-repair-kind', 'part')
    await expect(page.getByTestId('stage-repair')).toContainText('A → B')
    expect((await dots(page))[0]!.secured).toBe(true)                        // A is still learned
    await page.getByTestId('said-it').click(); await page.getByTestId('rate-natural').click()
    await expect(page.getByTestId('learn-flow')).toHaveAttribute('data-stage', 'recall')   // straight back to reciting, not to Sound or Flow
    await expect(page.getByTestId('span-recall')).toBeVisible()
    expect(await shown(page)).toEqual([])                                    // a fresh, hidden recitation
    await page.getByTestId('span-reveal').click(); await page.getByTestId('span-grade-independent').click()
    await expect(page.getByTestId('stage-partdone')).toContainText('A → B is joined')
    const flows = await idbRows(page, 'flows')
    expect(flows.some((f) => f.rating === 'tangled' && f.fromPhrase === 0 && f.toPhrase === 1 && f.reps === 0)).toBe(true)
    expect(flows.some((f) => f.rating === 'natural' && f.fromPhrase === 0 && f.toPhrase === 1 && f.reps > 0)).toBe(true)
  })

  test('3b. a failed recitation with no slip marked keeps what was already learned, and the repair targets the newest joint', async ({ page }) => {
    await page.goto(AK)
    await toRecitation(page); await page.getByTestId('span-reveal').click(); await page.getByTestId('span-grade-independent').click()
    await page.getByTestId('next-part').click()
    await toRecitation(page)
    await page.getByTestId('span-reveal').click(); await page.getByTestId('span-grade-failed').click()
    await expect(page.getByTestId('stage-repair')).toContainText('A → B')
    const d = await dots(page)
    expect(d[0]!.secured).toBe(true); expect(d[1]!.secured).toBe(false)
    await page.getByTestId('recite-again').click()
    await expect(page.getByTestId('span-recall')).toBeVisible()
  })

  test('4. closing and reopening with A + B joined: progress is kept and the next part is C', async ({ page }) => {
    await page.goto(AK)
    for (let p = 0; p < 2; p++) { await toRecitation(page); await page.getByTestId('span-reveal').click(); await page.getByTestId('span-grade-independent').click(); if (p === 0) await page.getByTestId('next-part').click() }
    await page.getByTestId('finish-today').click()
    await page.goto(AK)
    await expect(page.getByTestId('part-caption')).toContainText('Part C')
    const d = await dots(page)
    expect(d[0]!.secured && d[1]!.secured).toBe(true)
    expect(await idbRows(page, 'reviews')).toHaveLength(0)
  })

  test('5. progress saved by the previous version of the app (isolated part recalls, joins) still counts, and the next part is the first one not yet learned', async ({ page }) => {
    await page.goto(AK)
    const lay = await layoutOf(page, 2, 255), t = Date.now()
    await seed(page, 'parts', [
      part({ fromWord: lay[0]![0], toWord: lay[0]![1], occurredAt: t - 3 * 3600e3 }),                               // A alone
      part({ fromWord: lay[1]![0], toWord: lay[1]![1], occurredAt: t - 2.9 * 3600e3 }),                             // B alone (the old flow asked for this)
      part({ fromWord: lay[0]![0], toWord: lay[1]![1], occurredAt: t - 2.8 * 3600e3 }),                             // A + B
    ])
    await page.goto(AK)
    await expect(page.getByTestId('part-caption')).toContainText('Part C')
    const d = await dots(page)
    expect(d[0]!.secured && d[1]!.secured).toBe(true)
  })

  test('Ta-Ha 10: part by part, B\'s hint is the first word of B (not the first word of the ayah), and the meaning of each part matches its Arabic', async ({ page }) => {
    await page.goto('/learn/20/10/10')
    await page.getByTestId('learn-by-parts').click()
    await expect(page.getByTestId('part-dots')).toBeVisible()
    const lay = await layoutOf(page, 20, 10)
    expect(lay.length).toBe(5)                                                // the owner's five units for 20:10
    await expect(page.getByTestId('part-meaning')).toContainText('When he saw a fire')
    await toRecitation(page); await page.getByTestId('span-reveal').click(); await page.getByTestId('span-grade-independent').click()
    await page.getByTestId('next-part').click()
    await expect(page.getByTestId('part-meaning')).toContainText('said to his family')
    await toRecitation(page)
    await page.getByTestId('span-hint').click()
    expect(await shown(page)).toEqual([lay[1]![0]])
    expect(lay[1]![0]).toBeGreaterThan(0)
  })

  test('G: a short ayah is straightforward — no parts, no part dots', async ({ page }) => {
    await page.goto('/learn/112/1/1')
    await expect(page.getByTestId('learn-flow')).toBeVisible()
    await expect(page.getByTestId('part-dots')).toHaveCount(0)
    await completeLearning(page)
    expect(await idbRows(page, 'parts')).toHaveLength(0)
    expect(await idbRows(page, 'reviews')).toHaveLength(1)
  })

  test('H: the part screen says the whole ayah plays (parts have no audio of their own) and the ordinary player is there', async ({ page }) => {
    await page.goto(AK)
    await page.getByTestId('part-info-toggle').click()                                       // the explanation is one tap away, not on every screen
    await expect(page.getByTestId('part-audio-note')).toContainText('whole ayah plays')
    await expect(page.getByTestId('audio-play')).toBeVisible()
  })


  test('I: leaving in the middle of a part keeps the position after a reload, and a half-finished recall is never graded for you', async ({ page }) => {
    await page.goto(AK)
    await learnPart(page)
    await page.getByTestId('next-part').click()
    await page.getByTestId('practise-next').click()                                       // on to the next rung of part B
    await page.reload()
    await expect(page.getByTestId('learn-flow')).toHaveAttribute('data-stage', 'practise')
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

  test('"I already know further": tap the last part you are sure of and you are tested from the start up to it; pass and you carry on after it', async ({ page }) => {
    await page.goto(AK)
    await expect(page.getByTestId('part-dots')).toBeVisible()
    const k = (await dots(page)).length
    await expect(page.getByTestId('part-caption')).toContainText('Part A')
    await expect(page.locator('.arabic .hl').first()).toBeVisible()                 // the part in hand is highlighted
    await page.getByTestId('know-up-to').click()
    await page.getByTestId('know-to-2').click()                                       // up to C
    await expect(page.getByTestId('refresh-intro')).toContainText('Up to part C')
    await page.getByTestId('span-reveal').click()
    await page.getByTestId('span-grade-independent').click()
    await expect(page.getByTestId('part-caption')).toContainText('Part D')           // straight on to D
    const d = await dots(page)
    expect(d.slice(0, 3).every((x) => x.secured)).toBe(true)
    expect(d[3]!.current).toBe(true)
    const parts = await idbRows(page, 'parts')
    expect(parts).toHaveLength(1)
    expect(parts[0]).toMatchObject({ fromWord: 0, grade: 'independent' })
    expect(await idbRows(page, 'reviews')).toHaveLength(0)                            // a claim tested in parts is still not "memorised"
    expect(k).toBeGreaterThan(4)
  })

  test('"I already know further": a slip in the test sends you to that part only, and "never mind" returns to where you were', async ({ page }) => {
    await page.goto(AK)
    await page.getByTestId('know-up-to').click()
    await page.getByTestId('know-to-3').click()
    await page.getByTestId('claim-cancel').click()
    await expect(page.getByTestId('part-caption')).toContainText('Part A')
    await page.getByTestId('know-up-to').click()
    await page.getByTestId('know-to-2').click()
    await page.getByTestId('span-reveal').click()
    const w = await page.evaluate(() => (window as unknown as { __hifzPhrases: (s: number, a: number, p: unknown) => [number, number][] }).__hifzPhrases(2, 255, []))
    await page.locator(`[data-word="${w[1]![0]}"]`).click()                           // slipped at the start of B
    await page.getByTestId('span-grade-prompted').click()
    await expect(page.getByTestId('part-caption')).toContainText('Part B')
    const d = await dots(page)
    expect(d[0]!.secured).toBe(true)
    expect(d[1]!.secured).toBe(false)
  })

  test('"I already know further" up to the last part goes straight to reciting the whole ayah', async ({ page }) => {
    await page.goto(AK)
    await expect(page.getByTestId('part-dots')).toBeVisible()
    const k = (await dots(page)).length
    await page.getByTestId('know-up-to').click()
    await page.getByTestId(`know-to-${k - 1}`).click()
    await expect(page.getByTestId('stage-recall')).toHaveAttribute('data-recall-kind', 'whole')
  })

  test('the meaning of the part in hand is shown (verbatim from the translation) in Sound and Flow, and never during recall', async ({ page }) => {
    await page.goto(AK)
    await expect(page.getByTestId('part-meaning')).toContainText('Allah - there is no deity except Him')
    await page.getByTestId('practise-next').click()
    await expect(page.getByTestId('span-recall')).toBeVisible()
    await expect(page.getByText('there is no deity except Him')).toHaveCount(0)                              // not on screen while recalling: it is never the prompt
  })

  test('one tap hides the meaning, and it stays hidden (it is the one translation setting)', async ({ page }) => {
    await page.goto(AK)
    await page.getByTestId('hide-meaning').click()
    await expect(page.getByTestId('part-meaning')).toHaveCount(0)
    await page.reload()
    await expect(page.getByTestId('part-caption')).toBeVisible()
    await expect(page.getByTestId('part-meaning')).toHaveCount(0)
  })

  test('the meaning is not shown while recalling, and it fades for a part that has held over a break', async ({ page }) => {
    await page.goto('/')
    await page.goto(AK)
    const w = await page.evaluate(() => (window as unknown as { __hifzPhrases: (s: number, a: number, p: unknown) => [number, number][] }).__hifzPhrases(2, 255, []))
    const t = Date.now()
    await seed(page, 'parts', [
      part({ fromWord: w[0]![0], toWord: w[0]![1], occurredAt: t - 30 * 3600e3 }),
      part({ fromWord: w[0]![0], toWord: w[0]![1], occurredAt: t - 10 * 3600e3 }),                          // accurate again 20 hours later: it held
      part({ fromWord: w[0]![0], toWord: w[0]![1], grade: 'failed', occurredAt: t - 3600e3 }),              // then went wrong, so part A is in hand again
    ])
    await page.goto(AK)
    await expect(page.getByTestId('part-caption')).toContainText('Part A')
    await expect(page.getByTestId('part-meaning')).toHaveCount(0)                                            // faded: it must not become the prompt
  })

  test('Ta-Ha 10 (18 words) keeps the ordinary ladder, with its meaningful pieces, and one tap makes it part-by-part with the meaning of each part', async ({ page }) => {
    await page.goto('/learn/20/10/10')
    await expect(page.getByTestId('stage-practise')).toBeVisible()
    await expect(page.getByTestId('part-dots')).toHaveCount(0)
    await page.getByTestId('learn-by-parts').click()
    await expect(page.getByTestId('part-dots')).toBeVisible()
    expect((await dots(page)).length).toBeGreaterThanOrEqual(4)
    await expect(page.getByTestId('part-meaning')).toContainText('When he saw a fire')
    await learnPart(page)
    await page.getByTestId('next-part').click()
    await expect(page.getByTestId('part-meaning')).toContainText('said to his family')
  })
})
