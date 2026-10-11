import { expect, test, type Page } from '@playwright/test'
import { logIn, mockApis, wcsPlaylistItems } from './support/mocks'
import {
  createFridaySet,
  importCorrections,
  mixSettled,
  playlist,
  row,
  runningOrder,
  setStored,
} from './support/set'

const SPOTIFY = 'https://api.spotify.com/v1'

const mix = (page: Page) => page.getByRole('region', { name: 'The mix' })
const headline = (page: Page) => mix(page).getByTestId('headline')
const lastChange = (page: Page) => page.getByRole('status', { name: 'Last change' })
const alternatives = (page: Page) =>
  page.getByRole('radiogroup', { name: 'Alternative mixes' }).getByRole('radio')
const pairs = (page: Page) => page.getByRole('group', { name: 'Follow pairs' })
const count = (page: Page, name: string) => playlist(page, name).getByTestId('playlist-count')

/** Where a playlist header's controls are, to the pixel. */
async function controlPlaces(page: Page, name: string) {
  const header = playlist(page, name)
  const controls = {
    lowest: header.getByRole('textbox', { name: `Lowest BPM of ${name}` }),
    highest: header.getByRole('textbox', { name: `Highest BPM of ${name}` }),
    lowestHandle: header.getByRole('slider', { name: `Lowest BPM of ${name}` }),
    limit: header.getByRole('textbox', { name: `Limit of ${name}` }),
    menu: header.getByRole('button', { name: `More for ${name}` }),
    count: header.getByTestId('playlist-count'),
    bar: header.getByTestId('playlist-controls'),
  }
  const places: Record<string, string> = {}
  for (const [key, control] of Object.entries(controls)) {
    const box = await control.boundingBox()
    if (!box) throw new Error(`${key} of ${name} is not on screen`)
    // The count's text changes with the picks; its right edge is what must stay.
    places[key] =
      key === 'count'
        ? `right ${String(Math.round(box.x + box.width))}, top ${String(Math.round(box.y))}`
        : [box.x, box.y, box.width, box.height].map(Math.round).join(' ')
  }
  return places
}

async function openNewSet(page: Page, options: { corrections?: boolean } = {}) {
  await logIn(page)
  const log = await mockApis(page)
  await page.goto('./')
  if (options.corrections) await importCorrections(page)
  await createFridaySet(page)
  await mixSettled(page)
  return log
}

test('works on a set from two playlists, finds it as left, and saves it', async ({ page }) => {
  const log = await openNewSet(page)

  // ReccoBeats doesn't know three of the WCS tracks: they are left out, not in the way.
  await expect(headline(page)).toContainText('17tracks')
  await expect(row(page, 'WCS', 'Love Is').getByTestId('reason')).toHaveText('needs key/BPM')
  // Brother and Lemon Tree are in both playlists: the first that takes a track decides it.
  await expect(row(page, 'Slow ones', 'Brother').getByTestId('reason')).toHaveText('in WCS')

  // Key and BPM look like the way in that they are: a pointer, and a frame on hover.
  const key = row(page, 'WCS', 'Pompeii').getByRole('button', { name: /^Key of Pompeii/ })
  const bpm = row(page, 'WCS', 'Pompeii').getByRole('button', { name: /^BPM of Pompeii/ })
  const look = (button: typeof key) =>
    button.evaluate((el) => {
      const style = getComputedStyle(el)
      return { cursor: style.cursor, border: style.borderTopColor }
    })
  const rowHeight = async () => (await row(page, 'WCS', 'Pompeii').boundingBox())?.height
  const height = await rowHeight()
  for (const button of [key, bpm]) {
    const resting = await look(button)
    expect(resting.cursor).toBe('pointer')
    await button.hover()
    expect((await look(button)).border).not.toBe(resting.border)
    await expect(button).toHaveAttribute('title', 'Edit key and BPM')
  }
  expect(await rowHeight()).toBe(height)
  await page.mouse.move(0, 0)

  // Fix a missing key from the row: the track joins, and the change is explained.
  await row(page, 'WCS', 'Love Is')
    .getByRole('button', { name: /^Key of Love Is/ })
    .click()
  const dialog = page.getByRole('dialog', { name: /Key and BPM: Love Is/ })
  await expect(dialog.getByText('ReccoBeats has no data for this track.')).toBeVisible()
  await dialog.getByLabel('Key').selectOption('11B')
  await dialog.getByLabel('BPM').fill('88')
  await dialog.getByLabel(/Note or source/).fill('Chordify')
  await dialog.getByRole('button', { name: 'Save' }).click()
  await expect(dialog).toBeHidden()
  await expect(lastChange(page)).toContainText('17 → 18 tracks')
  await expect(lastChange(page)).toContainText('+ Love Is')
  await expect(row(page, 'WCS', 'Love Is')).toContainText('11B · A major')
  await expect(row(page, 'WCS', 'Love Is').getByTestId('by-hand')).toHaveCount(2)
  await mixSettled(page)

  // A BPM range on WCS: Brother (78) no longer passes there, so Slow ones takes it;
  // the two double-time tracks and Pompeii are left out.
  const wcs = playlist(page, 'WCS')
  await wcs.getByRole('textbox', { name: 'Lowest BPM of WCS' }).fill('85')
  await wcs.getByRole('textbox', { name: 'Lowest BPM of WCS' }).press('Enter')
  await wcs.getByRole('textbox', { name: 'Highest BPM of WCS' }).fill('125')
  await wcs.getByRole('textbox', { name: 'Highest BPM of WCS' }).press('Enter')
  await expect(row(page, 'WCS', 'Brother').getByTestId('reason')).toHaveText('outside range')
  await expect(row(page, 'Slow ones', 'Brother').getByTestId('reason')).toHaveCount(0)
  await expect(row(page, 'WCS', 'Pompeii').getByTestId('reason')).toHaveText('outside range')
  await expect(lastChange(page)).toContainText('18 → 15 tracks')
  await expect(lastChange(page)).toContainText(/cost \d+\.\d → \d+\.\d/)

  // A mark: Pompeii is in the set whatever the range says.
  await row(page, 'WCS', 'Pompeii').getByRole('button', { name: 'Always include' }).click()
  await expect(row(page, 'WCS', 'Pompeii').getByTestId('reason')).toHaveCount(0)
  await expect(lastChange(page)).toContainText('+ Pompeii')
  await mixSettled(page)

  // A limit with picks: the pick method shows, picks are tagged, the count follows.
  await wcs.getByRole('textbox', { name: 'Limit of WCS' }).fill('10')
  await wcs.getByRole('textbox', { name: 'Limit of WCS' }).press('Enter')
  await expect(wcs.getByRole('radio', { name: 'Random' })).toBeChecked()
  await wcs.getByRole('radio', { name: 'Best fit' }).click()
  await expect(count(page, 'WCS')).toHaveAttribute('title', /^10 of 20 tracks in the set · /)
  await expect(count(page, 'WCS')).toHaveAttribute('title', /\d+ not picked/)
  // Pompeii counts toward the limit; nine more are picked.
  await expect(wcs.getByTestId('reason').filter({ hasText: /^picked$/ })).toHaveCount(9)
  await mixSettled(page)
  await expect(headline(page)).toContainText('11tracks')

  // A follow pair across playlists, from a row: Brother (Slow ones) is followed by Love Is.
  await row(page, 'Slow ones', 'Brother')
    .getByRole('button', { name: /^Followed by…/ })
    .click()
  await expect(page.getByText(/Brother is followed by… choose a track/)).toBeVisible()
  await expect(
    row(page, 'WCS', 'Bloodstream').getByRole('button', { name: /can’t follow Brother/ }),
  ).toBeDisabled()
  await row(page, 'WCS', 'Love Is')
    .getByRole('button', { name: 'Follow Brother with Love Is: energy −' })
    .click()
  await expect(pairs(page).getByRole('listitem')).toHaveCount(1)
  await expect(
    row(page, 'WCS', 'Love Is').getByRole('button', { name: 'Follows Brother. Show it' }),
  ).toBeVisible()
  await mixSettled(page)
  await expect(
    page.getByRole('button', { name: 'Keep Brother and Love Is together' }),
  ).toHaveAttribute('aria-pressed', 'true')

  // And the other way: pin a transition in the running order.
  const unpinned = page.getByRole('button', { name: /^Keep .+ together$/, pressed: false }).first()
  await unpinned.click()
  await expect(pairs(page).getByRole('listitem')).toHaveCount(2)
  await mixSettled(page)

  // Another alternative.
  await alternatives(page).nth(1).click()
  await expect(alternatives(page).nth(1)).toBeChecked()
  const chosen = await runningOrder(page)
  expect(chosen).toHaveLength(11)

  // Everything is as it was left after a reload.
  await setStored(page, (set) => set.chosenMix !== null)
  await page.reload()
  await mixSettled(page)
  await expect(page.getByRole('textbox', { name: 'Set name' })).toHaveValue('Friday social')
  await expect(wcs.getByRole('textbox', { name: 'Lowest BPM of WCS' })).toHaveValue('85')
  await expect(wcs.getByRole('textbox', { name: 'Highest BPM of WCS' })).toHaveValue('125')
  await expect(wcs.getByRole('textbox', { name: 'Limit of WCS' })).toHaveValue('10')
  await expect(wcs.getByRole('radio', { name: 'Best fit' })).toBeChecked()
  await expect(
    row(page, 'WCS', 'Pompeii').getByRole('button', { name: 'Always include' }),
  ).toHaveAttribute('aria-pressed', 'true')
  await expect(row(page, 'WCS', 'Love Is')).toContainText('11B · A major')
  await expect(pairs(page).getByRole('listitem')).toHaveCount(2)
  await expect(alternatives(page).nth(1)).toBeChecked()
  expect(await runningOrder(page)).toEqual(chosen)

  // Save asks first: nothing is written until the name is confirmed.
  await page.getByRole('button', { name: 'Save to Spotify' }).click()
  const save = page.getByRole('dialog', { name: 'Save to Spotify' })
  const playlistName = save.getByRole('textbox', { name: 'Playlist name' })
  await expect(playlistName).toHaveValue('Friday social')
  await expect(playlistName).toBeFocused()
  expect(log.created).toEqual([])
  // A name one of my playlists has already: a warning, not a stop.
  await playlistName.fill('  wcs ')
  await expect(save.getByText(/You already have a playlist called “WCS”/)).toBeVisible()
  await expect(save.getByRole('button', { name: 'Save as new playlist' })).toBeEnabled()
  await playlistName.fill('Friday night mix')
  await expect(save.getByText(/You already have a playlist/)).toHaveCount(0)
  await playlistName.press('Enter')
  await expect(save).toBeHidden()

  // A new private playlist under that name, in mix order, with the link.
  const saved = page.getByTestId('save-status')
  await expect(saved).toContainText('Saved')
  await expect(saved.getByRole('link', { name: 'Open in Spotify' })).toHaveAttribute(
    'href',
    'https://open.spotify.com/playlist/new-mix',
  )
  expect(log.created).toEqual([
    expect.objectContaining({ name: 'Friday night mix', public: false }),
  ])
  const uris = log.added.flat()
  expect(uris).toHaveLength(11)
  expect(uris[uris.indexOf('spotify:track:76jtkq7829eEgEkoQrcjov') + 1]).toBe(
    'spotify:track:0bRs9U51McpqXynLOsg8yk', // Brother, then Love Is
  )
  expect(log.replaced).toEqual([])
  expect(log.sourceWrites).toEqual([])
  // The set keeps its own name.
  await expect(page.getByRole('textbox', { name: 'Set name' })).toHaveValue('Friday social')

  // The sets list knows it too.
  await page.getByRole('link', { name: 'Back to your sets' }).click()
  await expect(page.getByRole('list', { name: 'Your sets' })).toContainText('Saved to Spotify')
  await expect(page.getByRole('list', { name: 'Your sets' })).toContainText('11 tracks in the mix')
})

test('saving again: replace the playlist saved before, or create another', async ({ page }) => {
  const log = await openNewSet(page, { corrections: true })
  const save = page.getByRole('dialog', { name: 'Save to Spotify' })
  const playlistName = save.getByRole('textbox', { name: 'Playlist name' })
  const status = page.getByTestId('save-status')
  const link = status.getByRole('link', { name: 'Open in Spotify' })
  const openSave = () => page.getByRole('button', { name: 'Save to Spotify' }).click()

  // The first save: no earlier playlist, so no choice to make.
  await openSave()
  await expect(save.getByRole('radio')).toHaveCount(0)
  await playlistName.fill('Friday mix')
  await save.getByRole('button', { name: 'Save as new playlist' }).click()
  await expect(save).toBeHidden()
  await expect(status).toContainText('Saved')
  const first = [...(log.added[0] ?? [])]
  expect(first).toHaveLength(20)

  // Another mix: changed since the save.
  await alternatives(page).nth(1).click()
  await expect(status).toContainText('Changed since the save of')
  const second = (await runningOrder(page)).length
  expect(second).toBe(20)

  // Saving again offers to replace that playlist, by default, and says what goes.
  await openSave()
  await expect(playlistName).toHaveValue('Friday mix')
  const replace = save.getByRole('radio', { name: /^Replace “Friday mix”/ })
  await expect(replace).toBeChecked()
  await expect(save.getByText(/Its current tracks go and this mix takes their place/)).toBeVisible()
  // Its own name is no clash while replacing; it is when creating another.
  await expect(save.getByText(/You already have a playlist/)).toHaveCount(0)
  await save.getByRole('radio', { name: /^Create another playlist/ }).check()
  await expect(save.getByText(/You already have a playlist called “Friday mix”/)).toBeVisible()
  await expect(save.getByRole('button', { name: 'Save as new playlist' })).toBeVisible()
  await replace.check()
  await playlistName.fill('Friday mix, take two')
  await save.getByRole('button', { name: 'Replace in Spotify' }).click()
  await expect(save).toBeHidden()

  // The same playlist, with the new order and the new name; no new playlist.
  await expect(status).toContainText('Saved')
  await expect(link).toHaveAttribute('href', 'https://open.spotify.com/playlist/new-mix')
  expect(log.created).toHaveLength(1)
  expect(log.replaced).toHaveLength(1)
  expect(log.replaced[0]?.id).toBe('new-mix')
  expect(log.replaced[0]?.uris).toHaveLength(20)
  expect(log.replaced[0]?.uris).not.toEqual(first)
  expect(log.renamed).toEqual([{ id: 'new-mix', name: 'Friday mix, take two' }])

  // Saving once more, as another playlist: the first one is left as it is.
  await openSave()
  await expect(playlistName).toHaveValue('Friday mix, take two')
  await save.getByRole('radio', { name: /^Create another playlist/ }).check()
  await playlistName.fill('Friday mix, another')
  await save.getByRole('button', { name: 'Save as new playlist' }).click()
  await expect(save).toBeHidden()
  await expect(link).toHaveAttribute('href', 'https://open.spotify.com/playlist/new-mix-2')
  expect(log.created).toHaveLength(2)
  expect(log.replaced).toHaveLength(1)

  // The user now adds that saved playlist to the set as a source.
  await page.getByRole('button', { name: 'Add playlists' }).click()
  const add = page.getByRole('dialog', { name: 'Add playlists' })
  await add.getByRole('checkbox', { name: /Friday mix, another/ }).check()
  await add.getByRole('button', { name: 'Add to the set' }).click()
  await expect(add).toBeHidden()
  await expect(playlist(page, 'Friday mix, another')).toBeVisible()
  await mixSettled(page)

  // A source is never written to: replacing is not offered, and the dialog says why.
  await openSave()
  await expect(save.getByTestId('save-refused')).toHaveText(
    'The playlist saved before is a source of the set “Friday social”, and a source playlist is never changed.',
  )
  await expect(save.getByRole('radio')).toHaveCount(0)
  await expect(save.getByRole('button', { name: 'Replace in Spotify' })).toHaveCount(0)
  await save.getByRole('button', { name: 'Save as new playlist' }).click()
  await expect(save).toBeHidden()
  await expect(link).toHaveAttribute('href', 'https://open.spotify.com/playlist/new-mix-3')
  expect(log.created).toHaveLength(3)
  // Across all of it: one replace, of the set's own playlist, and no write to a source.
  expect(log.replaced.map((entry) => entry.id)).toEqual(['new-mix'])
  expect(log.sourceWrites).toEqual([])
})

test('says when a playlist changed in Spotify, and updates on demand', async ({ page }) => {
  await openNewSet(page, { corrections: true })
  await row(page, 'WCS', 'Pompeii').getByRole('button', { name: 'Always include' }).click()
  await expect(playlist(page, 'WCS').getByRole('status')).toHaveCount(0)
  await setStored(page, (set) => Object.keys(set.marks as object).length === 1)

  // Spotify now has another version of WCS: Pompeii is gone, a track was added.
  const json = (body: unknown) => ({ contentType: 'application/json', body: JSON.stringify(body) })
  await page.route(`${SPOTIFY}/playlists/wcs`, (route) =>
    route.fulfill(
      json({
        id: 'wcs',
        name: 'WCS',
        images: [],
        owner: { id: 'me', display_name: 'Me' },
        snapshot_id: 'wcs-2',
      }),
    ),
  )
  await page.route(`${SPOTIFY}/playlists/wcs/items**`, (route) => {
    const kept = wcsPlaylistItems().filter((entry) => entry.item.name !== 'Pompeii')
    const first = kept[0]
    if (!first) throw new Error('no items')
    const added = {
      ...first,
      item: { ...first.item, id: 'newtrack00000000000001', name: 'Brand new' },
    }
    return route.fulfill(json({ items: [...kept, added], next: null }))
  })
  await page.reload()
  await mixSettled(page)

  const notice = playlist(page, 'WCS').getByRole('status')
  await expect(notice).toContainText('1 new, 1 removed')
  // Nothing changed yet: the stored copy is in use.
  await expect(row(page, 'WCS', 'Pompeii')).toBeVisible()
  await expect(playlist(page, 'Slow ones').getByRole('status')).toHaveCount(0)

  // The notice has a line of its own: the controls are where they are without it.
  const withNotice = await controlPlaces(page, 'WCS')
  await playlist(page, 'WCS').getByRole('button', { name: 'Update WCS' }).click()
  await expect(playlist(page, 'WCS').getByText('Updated from Spotify.')).toBeVisible()
  await expect(playlist(page, 'WCS').getByText('1 new, 1 removed')).toHaveCount(0)
  expect(await controlPlaces(page, 'WCS')).toEqual(withNotice)
  await expect(playlist(page, 'WCS').getByText('1 track leaves the set: Pompeii.')).toBeVisible()
  await expect(playlist(page, 'WCS').getByText('1 mark: Pompeii (always include).')).toBeVisible()
  await expect(row(page, 'WCS', 'Brand new')).toBeVisible()
  await expect(playlist(page, 'WCS').getByRole('button', { name: 'Update WCS' })).toHaveCount(0)
  await expect(count(page, 'WCS')).toHaveAttribute('title', /^19 of 20 tracks in the set/)
  await setStored(page, (set) => Object.keys(set.marks as object).length === 0)

  // After a reload the stored copy is the new version: no notice.
  await page.reload()
  await mixSettled(page)
  await expect(row(page, 'WCS', 'Brand new')).toBeVisible()
  await expect(playlist(page, 'WCS').getByRole('button', { name: 'Update WCS' })).toHaveCount(0)
})

test('explains why no mix is possible, with the way out next to it', async ({ page }) => {
  await openNewSet(page, { corrections: true })
  await expect(headline(page)).toContainText('20tracks')

  // Two waves: the best mix is the owner's own hand-tuned order.
  await page.getByRole('radio', { name: 'Two waves' }).check({ force: true })
  await expect(alternatives(page).first()).toHaveAccessibleName(
    /^Mix 1, cost 63\.1, .* opens with Brother, closes with Safe and Sound$/,
  )
  expect((await runningOrder(page)).slice(0, 2)).toEqual(['Brother', 'Love Is'])

  // The chart's card, and the keys used.
  await page.getByRole('img', { name: /^7\. Pompeii, 11B, A major, 127.4 BPM/ }).focus()
  await expect(page.getByTestId('point-card')).toContainText('11B · A major')
  await expect(page.getByTestId('point-card')).toContainText('energy − from 12B · E major')
  await expect(row(page, 'WCS', 'Pompeii')).toHaveAttribute('data-highlighted', '')
  await expect(page.getByText('7B×4')).toBeVisible()

  for (const title of ['Counting Stars', 'Stolen Dance']) {
    await row(page, 'WCS', title).getByRole('button', { name: 'Exclude' }).click()
  }
  const problems = page.getByTestId('problems')
  await expect(problems.getByRole('heading', { name: 'No mix yet' })).toBeVisible()
  await expect(problems).toContainText(
    'Bloodstream (2A · E♭ minor) can’t follow or precede any other included track',
  )
  await expect(problems).toContainText('Left-out tracks that would fit: Stolen Dance')
  await expect(page.getByRole('button', { name: 'Save to Spotify' })).toBeDisabled()
  await expect(lastChange(page)).toContainText('no mix')

  // The fix is one step away, and the mix comes back in the same place.
  await problems.getByRole('button', { name: 'Always include Stolen Dance' }).click()
  await mixSettled(page)
  await expect(problems).toHaveCount(0)
  await expect(headline(page)).toContainText('19tracks')
  await expect(lastChange(page)).toContainText('mix found')
})

for (const size of [
  { width: 1280, height: 720 },
  { width: 1440, height: 900 },
]) {
  test(`the page never scrolls at ${size.width} × ${size.height}; the mix stays in view`, async ({
    page,
  }) => {
    await page.setViewportSize(size)
    await openNewSet(page, { corrections: true })

    const pageFits = () =>
      page.evaluate(() => {
        const root = document.documentElement
        return (
          root.scrollHeight <= window.innerHeight &&
          root.scrollWidth <= window.innerWidth &&
          document.body.scrollHeight <= window.innerHeight
        )
      })
    /** The chart and the headline numbers are wholly inside the window. */
    const mixInView = async () => {
      for (const part of [headline(page), page.getByTestId('tempo-chart')]) {
        const box = await part.boundingBox()
        expect(box).not.toBeNull()
        if (!box) return
        expect(box.y).toBeGreaterThanOrEqual(0)
        expect(box.x).toBeGreaterThanOrEqual(0)
        expect(box.y + box.height).toBeLessThanOrEqual(size.height)
        expect(box.x + box.width).toBeLessThanOrEqual(size.width)
      }
    }

    expect(await pageFits()).toBe(true)
    await mixInView()

    // The track list scrolls in its own area.
    const list = page.getByTestId('track-scroller')
    const scrolled = await list.evaluate((el) => {
      el.scrollTop = el.scrollHeight
      return { top: el.scrollTop, more: el.scrollHeight > el.clientHeight }
    })
    // 24 rows don't fit 720 px; at 900 px they just do, and there is nothing to scroll.
    if (size.height <= 720) {
      expect(scrolled.more).toBe(true)
      expect(scrolled.top).toBeGreaterThan(0)
    }
    await expect(row(page, 'Slow ones', 'Slow two')).toBeInViewport()
    expect(await page.evaluate(() => window.scrollY)).toBe(0)
    expect(await pageFits()).toBe(true)
    await mixInView()

    // So does the running order.
    const order = page.getByTestId('order-scroller')
    expect(await order.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true)

    // While a playlist's controls are being edited.
    const wcs = playlist(page, 'WCS')
    await wcs.getByRole('textbox', { name: 'Highest BPM of WCS' }).fill('125')
    await mixInView()
    await wcs.getByRole('textbox', { name: 'Highest BPM of WCS' }).press('Enter')
    await wcs.getByRole('slider', { name: 'Lowest BPM of WCS' }).focus()
    await page.keyboard.press('ArrowRight')
    await page.keyboard.press('PageUp')
    // From the open end of the scale (75): one step, then one bar.
    await expect(wcs.getByRole('textbox', { name: 'Lowest BPM of WCS' })).toHaveValue('81')
    // Best fit keeps the set mixable where it can, so the picks don't decide this test.
    await wcs.getByRole('textbox', { name: 'Limit of WCS' }).fill('16')
    await wcs.getByRole('textbox', { name: 'Limit of WCS' }).press('Enter')
    await wcs.getByRole('radio', { name: 'Best fit' }).click()
    await mixSettled(page)
    await expect(count(page, 'WCS')).toHaveAttribute('title', /^16 of 20 tracks in the set/)
    await mixInView()
    expect(await pageFits()).toBe(true)

    // While a track waits for its follower.
    await row(page, 'WCS', 'Higher Love')
      .getByRole('button', { name: /^Followed by…/ })
      .click()
    await expect(page.getByText(/is followed by… choose a track/)).toBeVisible()
    await mixInView()
    expect(await pageFits()).toBe(true)
    await page.keyboard.press('Escape')
    await expect(page.getByText(/is followed by… choose a track/)).toHaveCount(0)

    // And a problem stands where the mix was, in view too.
    await wcs.getByRole('textbox', { name: 'Limit of WCS' }).fill('')
    await wcs.getByRole('textbox', { name: 'Limit of WCS' }).press('Enter')
    for (const title of ['Counting Stars', 'Stolen Dance']) {
      await row(page, 'WCS', title).getByRole('button', { name: 'Exclude' }).click()
    }
    const problems = page.getByTestId('problems')
    await expect(problems).toBeVisible()
    const box = await problems.boundingBox()
    expect(box && box.y >= 0 && box.y + box.height <= size.height).toBe(true)
    expect(await pageFits()).toBe(true)
  })
}

for (const size of [
  { width: 1280, height: 720 },
  { width: 1440, height: 900 },
  { width: 375, height: 740 },
]) {
  test(`a limit moves no other control in the playlist header at ${size.width} px`, async ({
    page,
  }) => {
    await page.setViewportSize(size)
    await openNewSet(page, { corrections: true })
    const wcs = playlist(page, 'WCS')
    const limit = wcs.getByRole('textbox', { name: 'Limit of WCS' })
    const before = await controlPlaces(page, 'WCS')
    const below = await controlPlaces(page, 'Slow ones')

    // A limit: the pick method and Reshuffle appear in the place kept for them.
    await limit.fill('5')
    await limit.press('Enter')
    await expect(wcs.getByRole('radiogroup', { name: 'How WCS picks' })).toBeVisible()
    await expect(wcs.getByRole('button', { name: /Reshuffle/ })).toBeVisible()
    expect(await controlPlaces(page, 'WCS')).toEqual(before)
    // The method is inside its place, and its place inside the window.
    const method = await wcs.getByRole('radiogroup', { name: 'How WCS picks' }).boundingBox()
    const slot = await wcs.getByTestId('pick-slot').boundingBox()
    const shuffle = await wcs.getByRole('button', { name: /Reshuffle/ }).boundingBox()
    expect(method && slot && shuffle).toBeTruthy()
    if (method && slot && shuffle) {
      expect(method.x).toBeGreaterThanOrEqual(slot.x)
      expect(shuffle.x + shuffle.width).toBeLessThanOrEqual(slot.x + slot.width + 0.5)
      expect(slot.x + slot.width).toBeLessThanOrEqual(size.width)
    }

    // Best fit: Reshuffle goes, nothing else moves. And back.
    await wcs.getByRole('radio', { name: 'Best fit' }).click()
    await expect(wcs.getByRole('button', { name: /Reshuffle/ })).toHaveCount(0)
    expect(await controlPlaces(page, 'WCS')).toEqual(before)
    await wcs.getByRole('radio', { name: 'Random' }).click()
    await expect(wcs.getByRole('button', { name: /Reshuffle/ })).toBeVisible()
    expect(await controlPlaces(page, 'WCS')).toEqual(before)

    // No limit again.
    await limit.fill('')
    await limit.press('Enter')
    await expect(wcs.getByRole('radiogroup', { name: 'How WCS picks' })).toHaveCount(0)
    expect(await controlPlaces(page, 'WCS')).toEqual(before)
    // The next playlist's header didn't move either: the bar kept its height.
    expect(await controlPlaces(page, 'Slow ones')).toEqual(below)
  })
}

test('the workspace at phone width: tabs under the chart, no sideways scroll', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 740 })
  await openNewSet(page, { corrections: true })
  const fits = () =>
    page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    )
  expect(await fits()).toBe(true)
  await expect(headline(page)).toBeInViewport()
  await expect(page.getByTestId('tempo-chart')).toBeInViewport()

  // Tracks: a row's title, values and toggles are all reachable.
  await expect(page.getByRole('tab', { name: 'Tracks' })).toHaveAttribute('aria-selected', 'true')
  const pompeii = row(page, 'WCS', 'Pompeii')
  await pompeii.scrollIntoViewIfNeeded()
  await expect(pompeii.getByTestId('track-title')).toBeInViewport()
  await pompeii.getByRole('button', { name: 'Exclude' }).click()
  await expect(pompeii).toHaveAttribute('data-left-out', '')
  expect(await fits()).toBe(true)

  await page.getByRole('tab', { name: 'Mix' }).click()
  await expect(page.getByRole('radiogroup', { name: 'Alternative mixes' })).toBeVisible()
  await expect(lastChange(page)).toContainText('20 → 19 tracks')
  await page.getByRole('radio', { name: 'Steady build' }).check({ force: true })
  expect(await fits()).toBe(true)

  await page.getByRole('tab', { name: 'Order' }).click()
  await expect(page.getByRole('list', { name: 'Running order' })).toBeVisible()
  await expect(page.getByRole('button', { name: /^Keep .+ together$/ }).first()).toBeVisible()
  expect(await fits()).toBe(true)
  // The chart is still on top.
  await expect(page.getByTestId('tempo-chart')).toBeInViewport()
})
