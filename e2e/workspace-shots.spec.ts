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
  // One energy set by hand, so its mark is in the picture.
  await row(page, 'WCS', 'Girl on Fire')
    .getByRole('button', { name: /: Energy/ })
    .click()
  const edit = page.getByRole('dialog', { name: /^Key, BPM and energy: Girl on Fire/ })
  await edit.getByLabel('Energy').fill('8')
  await edit.getByRole('button', { name: 'Save' }).click()
  await expect(edit).toBeHidden()
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

test('Save to Spotify: the first save, and saving again', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 })
  await prepare(page)
  const dialog = page.getByRole('dialog', { name: 'Save to Spotify' })
  await page.getByRole('button', { name: 'Save to Spotify' }).click()
  await dialog.getByRole('textbox', { name: 'Playlist name' }).fill('wcs')
  await expect(dialog.getByText(/You already have a playlist called/)).toBeVisible()
  await page.screenshot({ path: `${DIR}/save-first.png` })
  await dialog.getByRole('textbox', { name: 'Playlist name' }).fill('Friday mix')
  await dialog.getByRole('button', { name: 'Save as new playlist' }).click()
  await expect(dialog).toBeHidden()

  await page
    .getByRole('radiogroup', { name: 'Alternative mixes' })
    .getByRole('radio')
    .nth(1)
    .click()
  await page.getByRole('button', { name: 'Save to Spotify' }).click()
  await expect(dialog.getByRole('radio', { name: /^Replace/ })).toBeChecked()
  await page.screenshot({ path: `${DIR}/save-again.png` })
})

for (const scheme of ['light', 'dark'] as const) {
  test(`the edit dialog, ${scheme}`, async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 })
    await page.emulateMedia({ colorScheme: scheme })
    await prepare(page)
    // Price Tag: the key and the energy are ReccoBeats' own, the BPM is set by hand.
    await row(page, 'WCS', 'Price Tag')
      .getByRole('button', { name: /^BPM of/ })
      .click()
    await expect(
      page.getByRole('dialog', { name: /^Key, BPM and energy: Price Tag/ }),
    ).toBeVisible()
    await page.screenshot({ path: `${DIR}/edit-dialog-${scheme}.png` })
  })
}

test('a playlist header with a limit and its pick method', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 })
  await prepare(page)
  const wcs = playlist(page, 'WCS')
  await wcs.getByRole('textbox', { name: 'Limit of WCS' }).fill('12')
  await wcs.getByRole('textbox', { name: 'Limit of WCS' }).press('Enter')
  await expect(wcs.getByRole('radiogroup', { name: 'How WCS picks' })).toBeVisible()
  await wcs.getByRole('radio', { name: 'Best fit' }).click()
  await wcs.getByRole('radio', { name: 'Random' }).click()
  await wcs.getByRole('radio', { name: 'Best fit' }).click()
  await mixSettled(page)
  await page.mouse.move(900, 500)
  await page.screenshot({ path: `${DIR}/header-with-limit.png` })
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
