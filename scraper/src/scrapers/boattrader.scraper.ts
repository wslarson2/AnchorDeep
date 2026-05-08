import * as cheerio from 'cheerio'
import type { RawListingData } from '@anchordeep/shared'
import { BoatType, HullMaterial, PropulsionType, SourceSite } from '@anchordeep/shared'
import { BaseScraper } from './base.scraper.js'
import { browserPool } from '../lib/browser-pool.js'
import { acquireToken } from '../lib/rate-limiter.js'
import { TARGET_MAKES, buildMakeParam, MAX_LENGTH_FT } from '../config/targets.js'

const BASE = 'https://www.boattrader.com'


export class BoatTraderScraper extends BaseScraper {
  readonly site = SourceSite.BOAT_TRADER
  readonly baseUrl = BASE

  extractExternalId(url: string): string {
    return extractBoatTraderId(url)
  }

  async fetchListingUrls(page: number): Promise<string[]> {
    await acquireToken(this.site)

    const makes = buildMakeParam('+').toLowerCase()
    const url = page === 1
      ? `${BASE}/boats/makemodel-${makes}/length-0,${MAX_LENGTH_FT}/`
      : `${BASE}/boats/makemodel-${makes}/length-0,${MAX_LENGTH_FT}/page-${page}/`

    const { page: browserPage, ctx } = await browserPool.fetch(url, {
      // BoatTrader detail pages use /boat/ (singular) — wait for any to appear
      waitFor: 'a[href*="/boat/"]',
    })

    // Grab all /boat/ detail links from live DOM
    const liveHrefs = await browserPage.evaluate(() =>
      Array.from(document.querySelectorAll('a[href*="/boat/"]'))
        .map(a => (a as HTMLAnchorElement).href)
        // Keep only detail pages: /boat/year-make-model-id/ — exclude /boats/, /boat-dealers/, etc.
        .filter(h => /\/boat\/[^/]+-\d{6,}/.test(h))
    )
    await ctx.close()

    console.log(`[boattrader] listing hrefs: ${liveHrefs.length} — sample: ${liveHrefs[0] ?? 'none'}`)

    return [...new Set(liveHrefs)].slice(0, 48)
  }

  async scrapeDetailPage(url: string): Promise<RawListingData> {
    await acquireToken(this.site)

    const { html, ctx } = await browserPool.fetch(url, {
      waitFor: 'h1, [data-testid="listing-price"], .listing-price',
      timeout: 60_000,
    })
    await ctx.close()

    const $ = cheerio.load(html)

    const externalId = extractBoatTraderId(url)

    // Try __NEXT_DATA__ (present on some detail pages even though search page lacks it)
    let nextData: any = null
    try {
      const raw = $('#__NEXT_DATA__').html()
      if (raw) nextData = JSON.parse(raw)
    } catch { /* ignore */ }

    // Try JSON-LD as secondary structured data source
    let jsonLd: any = null
    $('script[type="application/ld+json"]').each((_, el) => {
      try {
        const parsed = JSON.parse($(el).html() ?? '')
        if (parsed['@type'] === 'Product' || parsed.name) jsonLd = parsed
      } catch { /* ignore */ }
    })

    let title = ''
    let rawPriceStr: string | null = null
    let make: string | null = null
    let model: string | null = null
    let year: number | null = null
    let type: BoatType | null = null
    let lengthFt: number | null = null
    let hullMaterial: HullMaterial | null = null
    let propulsion: PropulsionType | null = null
    let engineHours: number | null = null
    let city: string | null = null
    let state: string | null = null
    let description: string | null = null
    let imageUrls: string[] = []
    let isSold = false
    const specs: Record<string, string> = {}

    const listing = nextData?.props?.pageProps?.listing ??
      nextData?.props?.pageProps?.data?.listing ??
      nextData?.props?.pageProps?.initialData?.listing ??
      null

    if (listing) {
        title = listing.headline ?? listing.title ?? listing.name ?? ''
        make = listing.make ?? listing.manufacturer ?? null
        model = listing.model ?? null
        year = listing.year ? parseInt(listing.year, 10) : null
        lengthFt = listing.length ? parseFloat(listing.length) : null
        rawPriceStr = listing.price?.asking != null ? `$${listing.price.asking}` : null
        isSold = listing.status === 'sold' || listing.status === 'inactive' || listing.isSold === true
        city = listing.location?.city ?? null
        state = listing.location?.stateCode ?? listing.location?.state ?? null

        // Flatten listing specs/features first
        const attrs = listing.attributes ?? listing.specs ?? listing.features ?? {}
        if (typeof attrs === 'object') {
          for (const [k, v] of Object.entries(attrs)) {
            if (v != null) specs[slugify(k)] = String(v)
          }
        }

        const urlHint = url.toLowerCase()
        const combinedText = (title + ' ' + description + ' ' + Object.values(specs).join(' ') + ' ' + urlHint).toLowerCase()
        const classVal = (listing.boatClass ?? listing.type ?? listing.category ?? combinedText).toLowerCase()
        type = mapBoatType(classVal)

        const hull = (listing.hullMaterial ?? combinedText).toLowerCase()
        hullMaterial = mapHullMaterial(hull)

        const drive = (listing.driveType ?? listing.propulsion ?? combinedText).toLowerCase()
        propulsion = mapPropulsion(drive)

        engineHours = listing.engineHours ?? listing.hours ?? null

        // Images
        const pics = listing.media ?? listing.images ?? listing.photos ?? []
        imageUrls = (Array.isArray(pics) ? pics : [])
          .map((p: any) => p.url ?? p.uri ?? p.src ?? (typeof p === 'string' ? p : null))
          .filter(Boolean)
          .slice(0, 10)

        description = listing.description ?? listing.descriptionBody ?? null
    }

    // DOM fallback if __NEXT_DATA__ was empty or incomplete
    if (!title) title = $('h1').first().text().trim()
    if (!rawPriceStr) {
      rawPriceStr =
        $('[data-testid="listing-price"]').first().text().trim() ||
        $('.listing-price').first().text().trim() ||
        $('[class*="price"]').first().text().trim() ||
        null
    }
    if (!isSold) {
      isSold =
        $('body').text().toLowerCase().includes('this listing is no longer available') ||
        $('[class*="sold"]').length > 0
    }
    if (!description) {
      description =
        $('[data-testid="description"] p, .description-text p, [class*="description"] p').first().text().trim() ||
        $('[data-testid="description"], .description-text, [class*="description-body"]').first().text().trim() ||
        null
      if (description) description = description.slice(0, 3000)
    }

    if (!imageUrls.length) {
      $('img[src*="boattrader.com"], img[src*="boatsgroup.com"]').each((_, img) => {
        const src = $(img).attr('src')
        if (src && !src.includes('logo') && !imageUrls.includes(src)) imageUrls.push(src)
      })
    }

    // Specs from DOM table
    $('[class*="spec"] dt, [class*="spec"] th, dl dt').each((_, el) => {
      const key = slugify($(el).text().trim())
      const val = $(el).next('dd, td').text().trim()
      if (key && val && !specs[key]) specs[key] = val
    })

    // Parse year/make/model from title if still missing
    if (!year || !make) {
      const parsed = parseTitleYearMake(title)
      year = year ?? parsed.year
      make = make ?? parsed.make ?? extractMakeFromUrl(url)
      model = model ?? parsed.model
    }

    // Parse year from description or URL if still missing
    if (!year && description) {
      const yearMatch = description.match(/\b(19[6-9]\d|20[0-2]\d)\b/)
      if (yearMatch) year = parseInt(yearMatch[1]!, 10)
    }
    if (!year && url) {
      const urlMatch = url.match(/\/(20\d{2})-/)
      if (urlMatch) year = parseInt(urlMatch[1]!, 10)
    }

    // Parse length from specs if missing
    if (!lengthFt) {
      const rawLen = specs['loa'] ?? specs['length'] ?? specs['length_overall'] ?? null
      if (rawLen) lengthFt = parseFloat(rawLen) || null
    }

    // Parse length from description if still missing
    if (!lengthFt && description) {
      const lenMatch = description.match(/\b(\d{1,3}(?:\.\d{1,2})?)\s*(?:feet|ft|')\b/i)
      if (lenMatch) lengthFt = parseFloat(lenMatch[1]!)
    }

    // Parse length from title if still missing
    if (!lengthFt && title) {
      const titleMatch = title.match(/\b(\d{1,3}(?:\.\d{1,2})?)\s*(?:feet|ft|')\b/i)
      if (titleMatch) lengthFt = parseFloat(titleMatch[1]!)
    }

    return {
      externalId,
      sourceUrl: url,
      site: this.site,
      title,
      rawPriceStr,
      make,
      model,
      year,
      type,
      lengthFt,
      hullMaterial,
      propulsion,
      engineHours,
      city,
      state,
      description,
      imageUrls,
      isSold,
      specs,
      rawJson: nextData ? { source: 'next_data' } : { source: 'dom' },
    }
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function extractMakeFromUrl(url: string): string | null {
  const slug = url.split('/').filter(Boolean).pop()?.toLowerCase() ?? ''
  for (const t of TARGET_MAKES) {
    if (slug.includes(t.make.toLowerCase().replace(/\s+/g, '-'))) return t.make
  }
  return null
}

function extractBoatTraderId(url: string): string {
  // URLs like /boat/2019-lagoon-450f-12345678/
  const m = url.match(/\/boat\/[^/]+-(\d{6,})\/?/)
  if (m) return m[1]!
  return url.split('/').filter(Boolean).pop()?.split('?')[0] ?? url
}



function slugify(s: string) {
  return s.toLowerCase().replace(/[\s/()]+/g, '_').replace(/[^a-z0-9_]/g, '').replace(/_+$/g, '')
}

function parseTitleYearMake(title: string) {
  const yearMatch = title.match(/\b(19[6-9]\d|20[0-2]\d)\b/)
  const year = yearMatch ? parseInt(yearMatch[1]!, 10) : null
  const rest = title.replace(/\b(19[6-9]\d|20[0-2]\d)\b/, '').trim().split(/\s+/)
  return { year, make: rest[0] ?? null, model: rest.slice(1).join(' ') || null }
}

function mapBoatType(s: string): BoatType | null {
  if (!s) return null
  if (s.includes('power') || s.includes('motor') || s.includes('sport')) return BoatType.POWERBOAT
  if (s.includes('sail')) return BoatType.SAILBOAT
  if (s.includes('pontoon')) return BoatType.PONTOON
  if (s.includes('pwc') || s.includes('personal') || s.includes('jet ski') || s.includes('waverunner')) return BoatType.PWC
  if (s.includes('fish') || s.includes('bass') || s.includes('walleye')) return BoatType.FISHING
  if (s.includes('house')) return BoatType.HOUSEBOAT
  if (s.includes('catamaran') || s.includes('cat ')) return BoatType.CATAMARAN
  return BoatType.OTHER
}

function mapHullMaterial(s: string): HullMaterial | null {
  if (!s) return null
  if (s.includes('fiberglass') || s.includes('fibreglass')) return HullMaterial.FIBERGLASS
  if (s.includes('aluminum') || s.includes('aluminium')) return HullMaterial.ALUMINUM
  if (s.includes('steel')) return HullMaterial.STEEL
  if (s.includes('wood') || s.includes('cedar') || s.includes('mahogany')) return HullMaterial.WOOD
  if (s.includes('composite') || s.includes('carbon')) return HullMaterial.COMPOSITE
  if (s.includes('inflatable') || s.includes('pvc') || s.includes('hypalon')) return HullMaterial.INFLATABLE
  return HullMaterial.OTHER
}

function mapPropulsion(s: string): PropulsionType | null {
  if (!s) return null
  if (s.includes('outboard')) return PropulsionType.OUTBOARD
  if (s.includes('sterndrive') || s.includes('stern drive') || s.includes('i/o') || s.includes('inboard/out')) return PropulsionType.STERNDRIVE
  if (s.includes('inboard')) return PropulsionType.INBOARD
  if (s.includes('sail')) return PropulsionType.SAIL
  if (s.includes('electric')) return PropulsionType.ELECTRIC
  if (s.includes('jet')) return PropulsionType.JET
  return PropulsionType.OTHER
}
