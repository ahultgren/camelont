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
  // Slow ones has a local file and an episode: the dialog says so before the set opens.
  await expect(dialog.getByText('Slow ones: 1 local file, 1 episode')).toBeVisible()
  await dialog.getByRole('button', { name: 'Open the set' }).click()
  await expect(page).toHaveURL(/\/camelont\/sets\/[\w-]+$/)
  await expect(page.getByRole('heading', { level: 1, name: 'Friday social' })).toBeAttached()
}

/** A playlist's section of the track list, by the playlist's name. */
export const playlist = (page: Page, name: string): Locator =>
  page.getByRole('region', { name, exact: true })

/** A track's row in a playlist's section, by its title (not by a pair that names it). */
export const row = (page: Page, playlistName: string, title: string | RegExp): Locator =>
  playlist(page, playlistName)
    .getByRole('listitem')
    .filter({ has: page.getByTestId('track-title').filter({ hasText: title }) })
    .first()

/** The titles of the running order, top to bottom. */
export const runningOrder = (page: Page): Promise<string[]> =>
  page.getByRole('list', { name: 'Running order' }).getByTestId('order-title').allTextContents()

/** The sets in the browser's storage (IndexedDB `camelont-sets`), as stored. */
export const storedSets = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<Record<string, unknown>[]>((resolve, reject) => {
        const opening = indexedDB.open('camelont-sets')
        opening.onerror = () => {
          reject(new Error('Could not open the sets database'))
        }
        opening.onsuccess = () => {
          const reading = opening.result.transaction('kv').objectStore('kv').getAll()
          reading.onsuccess = () => {
            const records = reading.result as { data: Record<string, unknown> }[]
            resolve(records.map((record) => record.data))
          }
        }
      }),
  )

/** The names of the stored sets. */
export const storedSetNames = async (page: Page) =>
  (await storedSets(page)).map((set) => String(set.name)).sort()

/**
 * Waits until the one stored set satisfies `check`. A set is written shortly after an
 * edit; a test that reloads the page right away waits for the write first.
 */
export async function setStored(page: Page, check: (set: Record<string, unknown>) => boolean) {
  await expect
    .poll(async () => {
      const [set] = await storedSets(page)
      return set !== undefined && check(set)
    })
    .toBe(true)
}

/** The mix has settled: a result is shown and nothing newer is on its way. */
export async function mixSettled(page: Page) {
  const mix = page.getByRole('region', { name: 'The mix' })
  await expect(mix.getByTestId('headline')).toBeVisible()
  await expect(mix).toHaveAttribute('aria-busy', 'false')
}
