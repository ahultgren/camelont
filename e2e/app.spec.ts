import { expect, test } from '@playwright/test'
import { mockApis } from './support/mocks'

test('logs in with PKCE and shows the sets list', async ({ page }) => {
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
  await expect(page.getByRole('heading', { name: 'No sets yet' })).toBeVisible()

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

  await page.reload()
  await expect(page.getByRole('heading', { name: 'Your sets' })).toBeVisible()
  await page.getByRole('button', { name: 'Log out' }).click()
  await expect(page.getByRole('button', { name: 'Log in with Spotify' })).toBeVisible()
})

test('sends logged-out users from a deep link to the start page', async ({ page }) => {
  await mockApis(page)
  await page.goto('./sets/some-set')
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
