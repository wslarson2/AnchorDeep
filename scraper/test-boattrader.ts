/**
 * Standalone BoatTrader search debug script.
 * Runs headful so you can watch exactly what loads.
 * Usage: PLAYWRIGHT_HEADLESS=false npm run test:boattrader
 */
import 'dotenv/config'
import { chromium } from 'playwright-extra'
import StealthPlugin from 'puppeteer-extra-plugin-stealth'

chromium.use(StealthPlugin())

const URL = 'https://www.boattrader.com/boats/makemodel-lagoon+leopard+fountaine-pajot/length-0,46/'

async function main() {
  console.log('Launching browser (headful)...')
  const browser = await (chromium as any).launch({
    headless: false,
    args: ['--no-sandbox', '--disable-blink-features=AutomationControlled', '--window-size=1366,768'],
  })

  const ctx = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
    viewport: { width: 1366, height: 768 },
    locale: 'en-US',
    timezoneId: 'America/New_York',
  })

  // Pre-set TrustArc consent
  await ctx.addInitScript(() => {
    try {
      localStorage.setItem('notice_gdpr_prefs', '0,1,2:')
      localStorage.setItem('notice_preferences', '2:')
      localStorage.setItem('cmapi_cookie_privacy', 'permit 1,2,3')
      document.cookie = 'notice_gdpr_prefs=0,1,2:; path=/'
      document.cookie = 'notice_preferences=2:; path=/'
    } catch { /* ignore */ }
  })

  const page = await ctx.newPage()

  // Log all network requests to spot XHR listing calls
  page.on('request', req => {
    if (req.resourceType() === 'fetch' || req.resourceType() === 'xhr') {
      console.log(`[XHR] ${req.method()} ${req.url()}`)
    }
  })

  console.log(`\nNavigating to: ${URL}`)
  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60_000 })

  console.log('Waiting for networkidle...')
  await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => console.log('(networkidle timed out — continuing)'))

  // Pause so you can inspect the page manually
  console.log('\nPage loaded. Inspecting DOM now...\n')

  // 1. Check for listing links via DOM
  const liveHrefs = await page.evaluate(() =>
    Array.from(document.querySelectorAll('a[href*="/listing/"]'))
      .map(a => (a as HTMLAnchorElement).href)
      .filter(h => !h.includes('/search') && !h.includes('/resources'))
  )
  console.log(`[DOM] a[href*="/listing/"] count: ${liveHrefs.length}`)
  if (liveHrefs.length) {
    console.log('[DOM] Sample URLs:')
    liveHrefs.slice(0, 5).forEach(u => console.log('  ', u))
  }

  // 2. Check for any anchor with /boats/ in href (alternate pattern)
  const boatHrefs = await page.evaluate(() =>
    Array.from(document.querySelectorAll('a[href*="/boats/"]'))
      .map(a => (a as HTMLAnchorElement).href)
  )
  console.log(`\n[DOM] a[href*="/boats/"] count: ${boatHrefs.length}`)
  boatHrefs.slice(0, 3).forEach(u => console.log('  ', u))

  // 3. Dump all unique href patterns to spot the right selector
  const allHrefPatterns = await page.evaluate(() => {
    const hrefs = Array.from(document.querySelectorAll('a[href]'))
      .map(a => (a as HTMLAnchorElement).pathname)
      .filter(p => p.length > 1)
    const patterns = new Set(hrefs.map(p => '/' + p.split('/')[1]))
    return Array.from(patterns).sort()
  })
  console.log('\n[DOM] All unique first-path-segment patterns on page:')
  allHrefPatterns.forEach(p => console.log('  ', p))

  // 4. Check __NEXT_DATA__
  const nextDataKeys = await page.evaluate(() => {
    const el = document.getElementById('__NEXT_DATA__')
    if (!el?.textContent) return null
    try {
      const data = JSON.parse(el.textContent)
      const pp = data?.props?.pageProps ?? {}
      return Object.keys(pp)
    } catch { return null }
  })
  console.log(`\n[__NEXT_DATA__] pageProps keys: ${nextDataKeys ? nextDataKeys.join(', ') : 'NOT FOUND'}`)

  // 5. Check page title / H1 to confirm we actually landed on a results page
  const h1 = await page.$eval('h1', el => el.textContent).catch(() => '(no h1)')
  const title = await page.title()
  console.log(`\n[PAGE] title: ${title}`)
  console.log(`[PAGE] h1: ${h1}`)

  console.log('\n--- Browser stays open for 60s so you can inspect ---')
  await page.waitForTimeout(60_000)

  await browser.close()
}

main().catch(err => { console.error(err); process.exit(1) })
