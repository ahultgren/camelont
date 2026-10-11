import { expect, test, type Page } from '@playwright/test'
import { logIn, mockApis } from './support/mocks'
import { createFridaySet, importCorrections, mixSettled, playlist, row } from './support/set'

/**
 * The reference screenshots in docs/reference/workspace/. Not part of the checks:
 *   SHOTS=1 pnpm exec playwright test workspace-shots
 */
test.skip(!process.env.SHOTS, 'Set SHOTS=1 to take the reference screenshots')
test.describe.configure({ mode: 'serial' })

const DIR = 'docs/reference/workspace'

/** A set with a range, marks, a limit with picks, a pair and an arc. */
async function prepare(page: Page) {
  await logIn(page)
  await mockApis(page)
  await page.goto('./')
  await importCorrections(page)
  await createFridaySet(page)
  await mixSettled(page)

  const wcs = playlist(page, 'WCS')
  await wcs.getByRole('textbox', { name: 'Lowest BPM of WCS' }).fill('85')
  await wcs.getByRole('textbox', { name: 'Highest BPM of WCS' }).fill('125')
  await wcs.getByRole('textbox', { name: 'Highest BPM of WCS' }).press('Enter')
  await row(page, 'WCS', 'Pompeii').getByRole('button', { name: 'Always include' }).click()
  await row(page, 'WCS', 'Shotgun').getByRole('button', { name: 'Exclude' }).click()
  await row(page, 'WCS', 'Love Is').getByRole('button', { name: 'Opener' }).click()
  await page.getByRole('radio', { name: 'Two waves' }).check({ force: true })
  await mixSettled(page)
}

for (const size of [
  { name: '1280x720', width: 1280, height: 720 },
  { name: '1440x900', width: 1440, height: 900 },
]) {
  for (const scheme of ['light', 'dark'] as const) {
    test(`workspace ${size.name} ${scheme}`, async ({ page }) => {
      await page.setViewportSize(size)
      await page.emulateMedia({ colorScheme: scheme })
      await prepare(page)
      await page.screenshot({ path: `${DIR}/workspace-${size.name}-${scheme}.png` })
    })
  }
}

test('armed "Followed by…"', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 })
  await prepare(page)
  await row(page, 'WCS', 'Higher Love')
    .getByRole('button', { name: /^Followed by/ })
    .click()
  await expect(page.getByText(/is followed by… choose a track/)).toBeVisible()
  await page.screenshot({ path: `${DIR}/followed-by-armed.png` })
})

test('problems in place of the mix', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 })
  await prepare(page)
  for (const title of ['Counting Stars', 'Stolen Dance']) {
    await row(page, 'WCS', title).getByRole('button', { name: 'Exclude' }).click()
  }
  await expect(page.getByTestId('problems')).toBeVisible()
  await page.screenshot({ path: `${DIR}/problems.png` })
})

test('phone', async ({ page }) => {
  // Prepared at laptop width, where every tool is on screen at once.
  await page.setViewportSize({ width: 1280, height: 720 })
  await prepare(page)
  await page.setViewportSize({ width: 390, height: 780 })
  await mixSettled(page)
  await page.screenshot({ path: `${DIR}/phone-tracks.png` })
  await page.getByRole('tab', { name: 'Mix' }).click()
  await page.screenshot({ path: `${DIR}/phone-mix.png` })
  await page.getByRole('tab', { name: 'Order' }).click()
  await page.screenshot({ path: `${DIR}/phone-order.png` })
})
