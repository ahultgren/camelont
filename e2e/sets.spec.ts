import { expect, test, type Page } from '@playwright/test'
import { logIn, mockApis } from './support/mocks'

/** The names of the sets in the browser's storage (IndexedDB `camelont-sets`). */
const storedSetNames = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<string[]>((resolve, reject) => {
        const opening = indexedDB.open('camelont-sets')
        opening.onerror = () => {
          reject(new Error('Could not open the sets database'))
        }
        opening.onsuccess = () => {
          const reading = opening.result.transaction('kv').objectStore('kv').getAll()
          reading.onsuccess = () => {
            const records = reading.result as { data: { name: string } }[]
            resolve(records.map((record) => record.data.name).sort())
          }
        }
      }),
  )

const setRows = (page: Page) => page.getByRole('list', { name: 'Your sets' }).getByRole('listitem')

async function createFridaySet(page: Page) {
  await page.getByRole('button', { name: 'New set' }).click()
  const dialog = page.getByRole('dialog', { name: 'New set' })
  await dialog.getByLabel(/Name/).fill('Friday social')
  await dialog.getByRole('checkbox', { name: /WCS/ }).check()
  await dialog.getByRole('searchbox').fill('slow')
  await dialog.getByRole('checkbox', { name: /Slow ones/ }).check()
  await expect(dialog.getByText('2 chosen: WCS, Slow ones')).toBeVisible()
  await dialog.getByRole('button', { name: 'Create set' }).click()
  return dialog
}

test('creates a set from two playlists, keeps it, and manages it', async ({ page }) => {
  await logIn(page)
  const log = await mockApis(page)
  await page.goto('./')
  await expect(page.getByRole('heading', { name: 'No sets yet' })).toBeVisible()

  // New set: a followed playlist can't be chosen; two of the user's own can.
  await page.getByRole('button', { name: 'New set' }).click()
  const picker = page.getByRole('dialog', { name: 'New set' })
  await expect(picker.getByRole('checkbox', { name: /Top Hits/ })).toBeDisabled()
  await expect(picker.getByText(/Followed, can’t be mixed/)).toBeVisible()
  await picker.getByRole('button', { name: 'Cancel' }).click()

  const dialog = await createFridaySet(page)
  await expect(dialog.getByText('Slow ones: 1 local file, 1 episode')).toBeVisible()
  await dialog.getByRole('button', { name: 'Open the set' }).click()

  // The set opens at its own address and shows both playlists.
  await expect(page).toHaveURL(/\/camelont\/sets\/[\w-]+$/)
  await expect(page.getByRole('heading', { level: 1, name: 'Friday social' })).toBeVisible()
  await expect(page.getByRole('listitem')).toHaveText(['WCS20 tracks', 'Slow ones4 tracks'])

  // Back on the list: one row, counting each track of the pool once.
  await page.getByRole('link', { name: /Your sets/ }).click()
  await expect(setRows(page)).toHaveCount(1)
  await expect(setRows(page).first()).toContainText('Friday social')
  await expect(setRows(page).first()).toContainText('22 tracks in the pool')
  await expect(setRows(page).first()).toContainText('Not saved to Spotify')

  // It is stored in the browser: still there after a reload, and opens by its address.
  await page.reload()
  await expect(setRows(page)).toHaveCount(1)
  await page.getByRole('link', { name: 'Friday social' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Friday social' })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('heading', { level: 1, name: 'Friday social' })).toBeVisible()
  await page.getByRole('link', { name: /Your sets/ }).click()

  // Rename.
  await page.getByRole('button', { name: 'Rename Friday social' }).click()
  const rename = page.getByRole('dialog', { name: 'Rename set' })
  await rename.getByLabel('Name').fill('Saturday social')
  await rename.getByRole('button', { name: 'Rename' }).click()
  await expect(setRows(page).first()).toContainText('Saturday social')

  // Duplicate: the copy is the newest edit, so it comes first.
  await page.getByRole('button', { name: 'Duplicate Saturday social' }).click()
  await expect(setRows(page)).toHaveCount(2)
  await expect(setRows(page).first()).toContainText('Saturday social copy')
  await expect.poll(() => storedSetNames(page)).toEqual(['Saturday social', 'Saturday social copy'])

  // Delete, after a confirmation that says Spotify isn't touched.
  await page.getByRole('button', { name: 'Delete Saturday social copy' }).click()
  const confirm = page.getByRole('dialog', { name: 'Delete “Saturday social copy”?' })
  await expect(confirm.getByText(/Nothing in Spotify is touched/)).toBeVisible()
  await confirm.getByRole('button', { name: 'Delete set' }).click()
  await expect(setRows(page)).toHaveCount(1)
  await expect.poll(() => storedSetNames(page)).toEqual(['Saturday social'])

  await page.reload()
  await expect(setRows(page)).toHaveText([/Saturday social/])

  // Nothing was written to Spotify along the way.
  expect(log.created).toEqual([])
  expect(log.added).toEqual([])
  expect(log.sourceWrites).toEqual([])
})

test('says which playlist couldn’t be read, creates nothing, and tries again', async ({ page }) => {
  await logIn(page)
  await mockApis(page)
  let failing = true
  await page.route('https://api.spotify.com/v1/playlists/slow/items**', (route) =>
    failing
      ? route.fulfill({
          status: 502,
          contentType: 'application/json',
          body: JSON.stringify({ error: { status: 502, message: 'Bad gateway' } }),
        })
      : route.fallback(),
  )
  await page.goto('./')
  const dialog = await createFridaySet(page)
  await expect(dialog.getByRole('alert')).toContainText(
    'Couldn’t read “Slow ones”: Bad gateway. No set was created.',
  )
  expect(await storedSetNames(page)).toEqual([])

  failing = false
  await dialog.getByRole('button', { name: 'Try again' }).click()
  await dialog.getByRole('button', { name: 'Open the set' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Friday social' })).toBeVisible()
})

test('the sets list and the New set dialog fit a phone', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 740 })
  await logIn(page)
  await mockApis(page)
  await page.goto('./')
  const fits = () =>
    page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    )

  const dialog = await createFridaySet(page)
  expect(await fits()).toBe(true)
  await dialog.getByRole('button', { name: 'Open the set' }).click()
  expect(await fits()).toBe(true)
  await page.getByRole('link', { name: /Your sets/ }).click()
  await expect(setRows(page)).toHaveCount(1)
  expect(await fits()).toBe(true)

  // Everything on a row is reachable by keyboard.
  await page.getByRole('link', { name: 'Friday social' }).focus()
  for (const name of ['Rename', 'Duplicate', 'Delete']) {
    await page.keyboard.press('Tab')
    await expect(page.getByRole('button', { name: `${name} Friday social` })).toBeFocused()
  }
})
