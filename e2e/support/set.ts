import { expect, type Locator, type Page } from '@playwright/test'
import { wcsCorrectionsFile } from './mocks'

/** Imports the user's corrections for the WCS set on the home page. */
export async function importCorrections(page: Page) {
  await page.getByLabel('Import corrections file').setInputFiles({
    name: 'camelont-overrides.json',
    mimeType: 'application/json',
    buffer: Buffer.from(wcsCorrectionsFile()),
  })
  await expect(page.getByText(/^Imported: /)).toBeVisible()
}

/** Creates "Friday social" from WCS and Slow ones on the home page and opens it. */
export async function createFridaySet(page: Page) {
  await page.getByRole('button', { name: 'New set' }).click()
  const dialog = page.getByRole('dialog', { name: 'New set' })
  await dialog.getByLabel(/Name/).fill('Friday social')
  await dialog.getByRole('checkbox', { name: /WCS/ }).check()
  await dialog.getByRole('checkbox', { name: /Slow ones/ }).check()
  await dialog.getByRole('button', { name: 'Create set' }).click()
  await dialog.getByRole('button', { name: 'Open the set' }).click()
  await expect(page).toHaveURL(/\/camelont\/sets\/[\w-]+$/)
}

/** A playlist's section of the track list, by the playlist's name. */
export const playlist = (page: Page, name: string): Locator =>
  page.getByRole('region', { name, exact: true })

/** A track's row in a playlist's section. */
export const row = (page: Page, playlistName: string, title: string): Locator =>
  playlist(page, playlistName).getByRole('listitem').filter({ hasText: title }).first()

/** The mix has settled: a result is shown and nothing newer is on its way. */
export async function mixSettled(page: Page) {
  const mix = page.getByRole('region', { name: 'The mix' })
  await expect(mix.getByTestId('headline')).toBeVisible()
  await expect(mix).toHaveAttribute('aria-busy', 'false')
}
