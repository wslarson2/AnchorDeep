import { chromium } from 'playwright-extra'
import StealthPlugin from 'puppeteer-extra-plugin-stealth'
import type { Browser, BrowserContext, Page } from 'playwright'

chromium.use(StealthPlugin())

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:122.0) Gecko/20100101 Firefox/122.0',
]

function randomUA() {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)]!
}

function jitter(ms: number, spread = 0.3) {
  return ms + (Math.random() * 2 - 1) * ms * spread
}

export class BrowserPool {
  private browser: Browser | null = null
  private launching = false
  private launchPromise: Promise<Browser> | null = null
  private headless: boolean
  private proxyUrl: string | undefined

  constructor() {
    this.headless = process.env.PLAYWRIGHT_HEADLESS !== 'false'
    this.proxyUrl = process.env.PROXY_URL || undefined
  }

  async getBrowser(): Promise<Browser> {
    if (this.browser?.isConnected()) return this.browser

    if (this.launchPromise) return this.launchPromise

    this.launchPromise = this.launch()
    this.browser = await this.launchPromise
    this.launchPromise = null
    return this.browser
  }

  private async launch(): Promise<Browser> {
    const args = [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled',
      '--disable-infobars',
      '--window-size=1366,768',
    ]

    const browser = await (chromium as any).launch({
      headless: this.headless,
      args,
      proxy: this.proxyUrl ? { server: this.proxyUrl } : undefined,
    })

    browser.on('disconnected', () => {
      this.browser = null
      console.warn('[browser-pool] Browser disconnected — will relaunch on next request')
    })

    return browser
  }

  /** Get a fresh context with randomized fingerprint */
  async newContext(): Promise<BrowserContext> {
    const browser = await this.getBrowser()
    const ctx = await browser.newContext({
      userAgent: randomUA(),
      viewport: { width: 1366, height: 768 },
      locale: 'en-US',
      timezoneId: 'America/New_York',
      extraHTTPHeaders: {
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
      },
    })
    return ctx
  }

  /** Navigate to URL with human-like timing, return page + HTML */
  async fetch(url: string, opts: { waitFor?: string; timeout?: number; cookies?: { name: string; value: string; domain: string; path?: string }[]; warmUpUrl?: string } = {}): Promise<{ page: Page; html: string; ctx: BrowserContext }> {
    const ctx = await this.newContext()

    if (opts.cookies?.length) {
      await ctx.addCookies(opts.cookies.map(c => ({ ...c, path: c.path ?? '/' })))
    }

    const page = await ctx.newPage()

    // Pre-set TrustArc consent in localStorage/cookies before any page script runs.
    // Boats Group sites (boats.com, boattrader.com, yachtworld.com) gate content behind
    // a consent wall that reads these values on init.
    await page.addInitScript(() => {
      try {
        localStorage.setItem('notice_gdpr_prefs', '0,1,2:')
        localStorage.setItem('notice_preferences', '2:')
        localStorage.setItem('cmapi_cookie_privacy', 'permit 1,2,3')
        localStorage.setItem('cmapi_gtm_bl', '')
        document.cookie = 'notice_gdpr_prefs=0,1,2:; path=/'
        document.cookie = 'notice_preferences=2:; path=/'
        document.cookie = 'cmapi_cookie_privacy=permit 1,2,3; path=/'
      } catch { /* sandboxed context — ignore */ }
    })

    // Block images/fonts/media to speed up scraping
    await page.route('**/*.{png,jpg,jpeg,gif,webp,svg,ico,woff,woff2,ttf,mp4,mp3}', r => r.abort())

    try {
      // Visit warm-up URL first (e.g. site homepage) to establish session/cookies
      if (opts.warmUpUrl) {
        await page.goto(opts.warmUpUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 }).catch(() => null)
        await this.handleConsentWall(page, opts.warmUpUrl, 30_000)
        await page.waitForTimeout(jitter(1000))
      }

      await page.goto(url, {
        waitUntil: 'domcontentloaded',
        timeout: opts.timeout ?? 60_000,
      })

      // Handle TrustArc consent wall (Boats Group sites redirect to consent.trustarc.com)
      await this.handleConsentWall(page, url, opts.timeout ?? 60_000)

      if (opts.waitFor) {
        await page.waitForSelector(opts.waitFor, { timeout: 15_000 }).catch(() => null)
      }

      // Human-like pause — extra time for JS-heavy sites to finish rendering
      await page.waitForTimeout(jitter(1500))

      const html = await page.content()
      return { page, html, ctx }
    } catch (err) {
      await ctx.close().catch(() => null)
      throw err
    }
  }

  private async handleConsentWall(page: Page, originalUrl: string, timeout: number) {
    // Wait up to 6s for TrustArc to inject its banner (it's async JS, not in initial HTML)
    const bannerSelector = '#truste-consent-track, #truste-consent-required, #truste-show-consent'
    const banner = await page.waitForSelector(bannerSelector, { timeout: 6_000, state: 'attached' }).catch(() => null)
    if (!banner) return

    console.log('[browser-pool] TrustArc consent banner detected — accepting')

    // Try programmatic API first
    const accepted = await page.evaluate(() => {
      try {
        // @ts-ignore
        if (window.truste?.eu?.clickListener) { window.truste.eu.clickListener(); return true }
        // @ts-ignore
        if (window.truste?.eu?.bindMap?.submitPref) { window.truste.eu.bindMap.submitPref(); return true }
      } catch { /* ignore */ }
      return false
    })
    if (accepted) {
      await page.waitForTimeout(1500)
      await page.waitForLoadState('domcontentloaded').catch(() => null)
      return
    }

    // Click accept button in main frame
    const acceptSelectors = ['#truste-consent-button', 'a.call', 'button[title="Accept All"]', 'button[title="I Accept"]', '.trustarc-banner-accept']
    for (const sel of acceptSelectors) {
      const btn = await page.$(sel)
      if (btn) { await btn.click(); break }
    }

    // Also check iframes (TrustArc sometimes renders in an iframe)
    for (const frame of page.frames()) {
      if (!frame.url().includes('trustarc')) continue
      for (const sel of acceptSelectors) {
        const btn = await frame.$(sel).catch(() => null)
        if (btn) { await btn.click(); break }
      }
    }

    await page.waitForTimeout(2000)
    await page.waitForLoadState('domcontentloaded').catch(() => null)
  }

  async close() {
    await this.browser?.close().catch(() => null)
    this.browser = null
  }
}

// Singleton shared across all Playwright scrapers
export const browserPool = new BrowserPool()
