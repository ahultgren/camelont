import { expect, test } from '@playwright/test'
import { logIn, mockApis, wcsCorrectionsFile } from './support/mocks'

test('logs in with PKCE and lists playlists', async ({ page }) => {
  await mockApis(page)
  let authorizeUrl: URL | null = null
  await page.route('https://accounts.spotify.com/authorize**', (route) => {
    authorizeUrl = new URL(route.request().url())
    const state = authorizeUrl.searchParams.get('state') ?? ''
    return route.fulfill({
      status: 302,
      headers: { location: `http://127.0.0.1:4173/camelont/callback?code=the-code&state=${state}` },
    })
  })
  let tokenForm: URLSearchParams | null = null
  await page.route('https://accounts.spotify.com/api/token', (route) => {
    tokenForm = new URLSearchParams(route.request().postData() ?? '')
    return route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        access_token: 'a',
        token_type: 'Bearer',
        expires_in: 3600,
        refresh_token: 'r',
        scope: '',
      }),
    })
  })

  await page.goto('./')
  await page.getByRole('button', { name: 'Log in with Spotify' }).click()
  await expect(page.getByRole('link', { name: /WCS/ })).toBeVisible()

  expect(authorizeUrl).not.toBeNull()
  const params = Object.fromEntries((authorizeUrl as URL | null)?.searchParams ?? [])
  expect(params).toMatchObject({
    response_type: 'code',
    code_challenge_method: 'S256',
    redirect_uri: 'http://127.0.0.1:4173/camelont/callback',
    scope: 'playlist-read-private playlist-read-collaborative playlist-modify-private',
  })
  expect((tokenForm as URLSearchParams | null)?.get('code')).toBe('the-code')
  expect((tokenForm as URLSearchParams | null)?.get('code_verifier')).toHaveLength(64)
  await expect(page.getByText(/Followed, can’t be mixed/)).toBeVisible()

  await page.reload()
  await expect(page.getByRole('link', { name: /WCS/ })).toBeVisible()
  await page.getByRole('button', { name: 'Log out' }).click()
  await expect(page.getByRole('button', { name: 'Log in with Spotify' })).toBeVisible()
})

test('fixes data, compares mixes, explores one and saves it', async ({ page }) => {
  await logIn(page)
  const log = await mockApis(page)
  await page.goto('./')
  await page.getByRole('link', { name: /WCS/ }).click()

  // ReccoBeats doesn't know three tracks: mixing waits for them.
  await expect(page.getByText('3 track(s) have no key or BPM')).toBeVisible()
  await expect(page.getByText('Waiting for key and BPM')).toBeVisible()

  // Fix one by hand…
  await page.getByRole('button', { name: 'Fix key and BPM of Love Is' }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Key').selectOption('11B')
  await dialog.getByLabel('BPM').fill('88')
  await dialog.getByLabel(/Note or source/).fill('Chordify')
  await dialog.getByRole('button', { name: 'Save' }).click()
  await expect(dialog).toBeHidden()
  await expect(page.getByText('2 track(s) have no key or BPM')).toBeVisible()

  // …and import the rest of the user's corrections.
  await page.getByLabel('Import corrections file').setInputFiles({
    name: 'camelont-overrides.json',
    mimeType: 'application/json',
    buffer: Buffer.from(wcsCorrectionsFile()),
  })
  await expect(page.getByText(/Imported: 5 new, 1 updated, 0 unchanged\./)).toBeVisible()

  const mixes = page.getByRole('radiogroup', { name: 'Alternative mixes' })
  await expect(mixes.getByRole('radio')).not.toHaveCount(0)
  expect(await mixes.getByRole('radio').count()).toBeGreaterThan(1)

  // Two waves: the best mix is the user's own hand-tuned order.
  await page.getByRole('radio', { name: /Two waves/ }).check()
  await expect(mixes.getByRole('radio').first()).toContainText('cost 63.1')
  await expect(mixes.getByRole('radio').first()).toContainText('OpensBrother')

  // Compare: pick the second mix, then back to the first.
  await mixes.getByRole('radio').nth(1).click()
  await expect(page.getByRole('heading', { name: 'Mix 2', level: 3 })).toBeVisible()
  await mixes.getByRole('radio').first().click()

  // Explore: focus a point to see its card.
  await page.getByRole('img', { name: /^7\. Pompeii, 11B, A major, 127.4 BPM/ }).focus()
  await expect(page.getByTestId('point-card')).toContainText('11B · A major')
  await expect(page.getByTestId('point-card')).toContainText('energy − from 12B · E major')
  await expect(page.getByText('7B×4')).toBeVisible()

  // Save.
  await page.getByRole('button', { name: 'Save as a new playlist' }).click()
  await expect(page.getByRole('link', { name: 'Open in Spotify' })).toHaveAttribute(
    'href',
    'https://open.spotify.com/playlist/new-mix',
  )
  expect(log.created).toEqual([
    expect.objectContaining({ name: 'WCS · Camelot mix', public: false }),
  ])
  const uris = log.added.flat()
  expect(uris).toHaveLength(20)
  expect(uris[0]).toBe('spotify:track:76jtkq7829eEgEkoQrcjov') // Brother
  expect(uris[19]).toBe('spotify:track:5JVbvCHX10U2pLa5DEqGav') // Safe and Sound
  expect(log.sourceWrites).toEqual([])
})

test('explains why no mix is possible', async ({ page }) => {
  await logIn(page)
  await mockApis(page)
  await page.goto('./playlists/wcs')
  await page.getByLabel('Import corrections file').setInputFiles({
    name: 'c.json',
    mimeType: 'application/json',
    buffer: Buffer.from(wcsCorrectionsFile()),
  })
  await expect(page.getByRole('radiogroup', { name: 'Alternative mixes' })).toBeVisible()

  for (const title of ['Counting Stars', 'Stolen Dance']) {
    await page
      .getByRole('listitem')
      .filter({ hasText: title })
      .first()
      .getByRole('checkbox', { name: 'Exclude' })
      .check()
  }
  await expect(page.getByText('No clash-free mix is possible')).toBeVisible()
  await expect(
    page.getByText(
      /Bloodstream \(2A · E♭ minor\) can’t follow or precede any other included track/,
    ),
  ).toBeVisible()
  await expect(page.getByText(/Excluded tracks that would fit: Stolen Dance/)).toBeVisible()

  // Including one of them again brings the mixes back.
  await page
    .getByRole('listitem')
    .filter({ hasText: 'Stolen Dance' })
    .first()
    .getByRole('checkbox', { name: 'Exclude' })
    .uncheck()
  await expect(page.getByRole('radiogroup', { name: 'Alternative mixes' })).toBeVisible()
})

test('sends logged-out users from a deep link to the start page', async ({ page }) => {
  await mockApis(page)
  await page.goto('./playlists/wcs')
  await expect(page.getByRole('button', { name: 'Log in with Spotify' })).toBeVisible()
})

test('ships a 404.html copy of the app shell for GitHub Pages deep links', async ({ request }) => {
  const [index, fallback] = await Promise.all([
    request.get('./index.html'),
    request.get('./404.html'),
  ])
  expect(fallback.ok()).toBe(true)
  expect(await fallback.text()).toBe(await index.text())
})
