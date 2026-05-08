import * as cheerio from 'cheerio'
import axios from 'axios'
import type { RawListingData } from '@anchordeep/shared'
import { BoatType, HullMaterial, PropulsionType, SourceSite } from '@anchordeep/shared'
import { BaseScraper } from './base.scraper.js'
import { browserPool } from '../lib/browser-pool.js'
import { acquireToken } from '../lib/rate-limiter.js'
import { TARGET_MAKES, MAX_LENGTH_FT } from '../config/targets.js'

const HTTP_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'Accept-Encoding': 'gzip, deflate, br',
  'Cache-Control': 'no-cache',
  'Pragma': 'no-cache',
  'Sec-Fetch-Dest': 'document',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Site': 'same-origin',
  'Upgrade-Insecure-Requests': '1',
}

const BASE = 'https://www.boats.com'

export class BoatsComScraper extends BaseScraper {
  readonly site = SourceSite.BOATS_COM
  readonly baseUrl = BASE

  extractExternalId(url: string): string {
    return url.split('/').filter(Boolean).pop()?.split('?')[0] ?? url
  }

  async fetchListingUrls(page: number): Promise<string[]> {
    const target = TARGET_MAKES[page - 1]
    if (!target) return []

    await acquireToken(this.site)

    // boats.com uses hyphenated lowercase make params (e.g. fountaine-pajot)
    const make = target.makeParam.toLowerCase().replace(/\+/g, '-')
    const url = `${BASE}/boats-for-sale/?make=${encodeURIComponent(make)}&length=0-${MAX_LENGTH_FT}ft`

    // Try plain HTTP first to avoid Playwright bot detection
    let html: string | null = null
    try {
      const resp = await axios.get<string>(url, {
        headers: { ...HTTP_HEADERS, 'Referer': BASE + '/' },
        timeout: 30_000,
        responseType: 'text',
      })
      html = resp.data
    } catch {
      // Fall back to Playwright if HTTP fails
      const { page: browserPage, ctx } = await browserPool.fetch(url, {
        warmUpUrl: BASE,
        waitFor: 'a[href*="/boats-for-sale/"][href*="/"]',
      })

      // Legacy jQuery/RequireJS app — listings load via XHR after page init
      await browserPage.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => null)

      html = await browserPage.content()
      await ctx.close()
    }

    const $ = cheerio.load(html)

    // boats.com detail page URLs use type-category paths (from their bdpMap)
    const hrefs: string[] = []
    const LISTING_PATH = /\/(sailing-boats|power-boats|unpowered|segelboote|motor-boote|barcos-a-motor|veleros|bateaux-a-moteur|voiliers|barche-a-vela|barche-a-motore|zeilboten|motorboten)\//
    $('a[href]').each((_, el) => {
      const href = $(el).attr('href')
      if (href && LISTING_PATH.test(href)) {
        // Convert relative URLs to absolute
        const fullUrl = href.startsWith('http') ? href : `${BASE}${href}`
        hrefs.push(fullUrl)
      }
    })

    console.log(`[boats.com] listing hrefs found: ${hrefs.length} — sample: ${hrefs[0] ?? 'none'}`)

    return [...new Set(hrefs)].slice(0, 48)
  }

  async scrapeDetailPage(url: string): Promise<RawListingData> {
    await acquireToken(this.site)

    // Try plain HTTP first — boats.com is Next.js SSR so __NEXT_DATA__ is in the initial HTML.
    // This avoids Playwright bot detection that causes 403s.
    let html: string
    try {
      const resp = await axios.get<string>(url, {
        headers: { ...HTTP_HEADERS, 'Referer': BASE + '/' },
        timeout: 30_000,
        responseType: 'text',
      })
      html = resp.data
    } catch {
      // Fall back to Playwright if HTTP fails
      const result = await browserPool.fetch(url, {
        warmUpUrl: BASE,
        waitFor: 'h1, [class*="price"], [data-testid="price"]',
        timeout: 60_000,
      })
      await result.ctx.close()
      html = result.html
    }

    const $ = cheerio.load(html)
    const externalId = url.split('/').filter(Boolean).pop()?.split('?')[0] ?? url

    // Try __NEXT_DATA__ first — boats.com shares parent infra with YachtWorld
    let listing: any = null
    try {
      const raw = $('#__NEXT_DATA__').html()
      if (raw) {
        const data = JSON.parse(raw)
        listing =
          data?.props?.pageProps?.listing ??
          data?.props?.pageProps?.boat ??
          data?.props?.pageProps?.data?.boat ??
          null
      }
    } catch { /* fall through to DOM */ }

    // Try JSON-LD structured data as secondary source
    let jsonLd: any = null
    $('script[type="application/ld+json"]').each((_, el) => {
      try {
        const parsed = JSON.parse($(el).html() ?? '')
        if (parsed['@type'] === 'Product' || parsed.name) jsonLd = parsed
      } catch { /* ignore */ }
    })

    let title = listing?.headline ?? listing?.name ?? jsonLd?.name ?? $('h1').first().text().trim()
    let rawPriceStr: string | null = null
    let description: string | null = null
    const specs: Record<string, string> = {}
    let imageUrls: string[] = []

    if (listing) {
      rawPriceStr = listing.price?.asking != null ? `$${listing.price.asking}` : null
      description = listing.description ?? listing.descriptionBody ?? jsonLd?.description ?? null

      const attrs = listing.specs ?? listing.attributes ?? {}
      for (const [k, v] of Object.entries(attrs)) {
        if (v != null) specs[slugify(k)] = String(v)
      }

      const pics = listing.images ?? listing.media ?? []
      imageUrls = pics.map((p: any) => p.url ?? p.uri ?? (typeof p === 'string' ? p : null)).filter(Boolean).slice(0, 10)
    }

    // DOM fallbacks — avoid price-range filter dropdowns (contain "All Price Ranges")
    if (!rawPriceStr) {
      let priceCandidate: string | null = null

      // Try standard selectors
      if (!priceCandidate) {
        priceCandidate =
          jsonLd?.offers?.price != null ? `$${jsonLd.offers.price}` :
          $('[data-testid="price"]').first().text().trim() ||
          $('span[class*="price"]').first().text().trim() ||
          $('div[class*="price"]').not('.price-range-filter').first().text().trim() ||
          $('[class*="asking-price"], [class*="listing-price"], [class*="price-value"]').first().text().trim() ||
          null
      }

      // Fallback: Search all text for price-like patterns
      if (!priceCandidate) {
        const pageText = $('body').text()
        const priceMatch = pageText.match(/\$[\d,]+(?:\.\d{2})?|\$[A-Z]+[\d,]+/)
        if (priceMatch) priceCandidate = priceMatch[0]
      }

      if (priceCandidate && !priceCandidate.includes('All Price') && !priceCandidate.includes('Price Range')) {
        rawPriceStr = priceCandidate
      }
    }

    if (!description) {
      const descParagraphs = $('[class*="description"] p').map((_, el) => $(el).text().trim()).get().filter(Boolean).join('\n')
      const descFallback = $('[class*="description"]').first().text().trim()
      description = jsonLd?.description ?? (descParagraphs || descFallback || null)
      if (description) description = description.slice(0, 3000)
    }

    if (!imageUrls.length) {
      $('img[src*="boats.com"], img[data-src*="boats.com"], [class*="gallery"] img').each((_, img) => {
        const src = $(img).attr('src') ?? $(img).attr('data-src')
        if (src && !src.includes('logo') && !src.includes('icon') && !imageUrls.includes(src)) imageUrls.push(src)
      })
    }

    // Parse Boat Details section and specs tables
    $('[class*="spec"] dt, [class*="detail"] dt, dl dt').each((_, el) => {
      const key = slugify($(el).text().trim())
      const val = $(el).next('dd, td').text().trim()
      if (key && val && !specs[key]) specs[key] = val
    })

    // Extract from Boat Details section - look for label then next value
    const detailLabels = $('dt, [class*="label"]').toArray()
    for (const label of detailLabels) {
      const labelText = $(label).text().trim().toLowerCase()
      const valueEl = $(label).next('dd, td, [class*="value"]')
      const valueText = valueEl.text().trim()

      if (labelText.includes('length') && valueText && !specs['length']) {
        const match = valueText.match(/(\d+(?:\.\d+)?)\s*(?:ft|feet)/i)
        if (match) specs['length'] = match[1]!
      }
      if (labelText.includes('hull') && valueText && !specs['hull_material']) {
        specs['hull_material'] = valueText
      }
    }

    const isSold =
      listing?.status === 'sold' ||
      $('[class*="sold"]').length > 0 ||
      $('body').text().toLowerCase().includes('this listing is no longer available')

    const make = listing?.make ?? specs['make'] ?? extractMakeFromUrl(url) ?? null
    const model = listing?.model ?? specs['model'] ?? null

    // Parse year from title, description, or URL
    let year = listing?.year
      ? parseInt(listing.year, 10)
      : specs['year'] ? parseInt(specs['year'], 10) : parseYear(title)

    if (!year && description) {
      const yearMatch = description.match(/\b(19[6-9]\d|20[0-2]\d)\b/)
      if (yearMatch) year = parseInt(yearMatch[1]!, 10)
    }

    if (!year && url) {
      const urlMatch = url.match(/\/(20\d{2})-/)
      if (urlMatch) year = parseInt(urlMatch[1]!, 10)
    }

    let lengthFt = listing?.length
      ? parseFloat(listing.length)
      : parseLengthFromSpecs(specs)

    // Search entire page for length value if still missing
    if (!lengthFt) {
      let found = false
      $('*').each((_, el) => {
        if (found) return false
        const text = $(el).text().trim()
        // Look for "Length" label followed by a number
        if (text.toLowerCase().includes('length') && text.length < 100) {
          const match = text.match(/length[:\s]+(\d+(?:\.\d+)?)\s*(?:ft|feet)?/i)
          if (match) {
            lengthFt = parseFloat(match[1]!)
            found = true
            return false
          }
        }
      })
    }

    // Parse length from description if still missing (e.g., "36.17 feet")
    if (!lengthFt && description) {
      const lenMatch = description.match(/\b(\d{1,3}(?:\.\d{1,2})?)\s*(?:feet|ft|')\b/i)
      if (lenMatch) lengthFt = parseFloat(lenMatch[1]!)
    }

    const engineHours = listing?.engineHours ?? (specs['engine_hours'] ? parseInt(specs['engine_hours'], 10) : null)

    const listing_city = listing?.location?.city ?? null
    const listing_state = listing?.location?.stateCode ?? listing?.location?.state ?? null

    // Avoid picking up location form elements; look for actual address text in metadata
    let city = listing_city ?? null
    let state = listing_state ?? null

    if (!city && !state) {
      // Try JSON-LD address if available
      if (jsonLd?.address?.addressLocality) {
        city = jsonLd.address.addressLocality
        if (jsonLd?.address?.addressRegion) state = jsonLd.address.addressRegion
      }

      // Last resort: look for common location patterns in visible text
      if (!city) {
        $('span, p, div').each((_, el) => {
          if (city) return false
          const text = $(el).text().trim()
          // Look for patterns like "City, ST" or US state names
          const match = text.match(/^([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?),\s*([A-Z]{2})$/)
          if (match) {
            city = match[1]
            state = match[2]
            return false
          }
        })
      }
    }

    // Combine specs, description, and title for better type/hull/propulsion detection
    const combinedText = (title + ' ' + description + ' ' + Object.values(specs).join(' ')).toLowerCase()
    const classVal = (listing?.boatClass ?? listing?.type ?? listing?.category ?? specs['class'] ?? combinedText).toLowerCase()
    const hullRaw = (listing?.hullMaterial ?? specs['hull_material'] ?? specs['hull'] ?? combinedText).toLowerCase()
    const driveRaw = (listing?.driveType ?? specs['drive_type'] ?? specs['propulsion'] ?? combinedText).toLowerCase()

    // Fall back to title-parsed make/model if nothing from structured data.
    // When make is already known, extract model by stripping the known make from title
    // rather than using parseTitle's first-word heuristic (which misparses multi-word makes).
    const { year: parsedYear, make: parsedMake, model: parsedModel } = parseTitle(title)
    const resolvedMake = make ?? parsedMake
    const resolvedModel = model ?? (resolvedMake ? parseTitleModel(title, resolvedMake) : parsedModel)

    return {
      externalId,
      sourceUrl: url,
      site: this.site,
      title,
      rawPriceStr,
      make: resolvedMake,
      model: resolvedModel,
      year: year ?? parsedYear,
      type: mapBoatType(classVal),
      lengthFt,
      hullMaterial: mapHullMaterial(hullRaw),
      propulsion: mapPropulsion(driveRaw),
      engineHours,
      city,
      state,
      description,
      imageUrls,
      isSold,
      specs,
      rawJson: listing ? { source: 'next_data' } : jsonLd ? { source: 'json_ld' } : { source: 'dom' },
    }
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseTitleModel(title: string, knownMake: string): string | null {
  const withoutYear = title.replace(/\b(19[6-9]\d|20[0-2]\d)\b/, '').trim()
  const idx = withoutYear.toLowerCase().indexOf(knownMake.toLowerCase())
  if (idx === -1) return null
  const model = withoutYear.slice(idx + knownMake.length).trim().split(/[-–|]/)[0]?.trim() ?? null
  return model || null
}

function extractMakeFromUrl(url: string): string | null {
  const slug = url.split('/').filter(Boolean).pop()?.toLowerCase() ?? ''
  for (const t of TARGET_MAKES) {
    if (slug.includes(t.make.toLowerCase().replace(/\s+/g, '-'))) return t.make
  }
  return null
}

function slugify(s: string) {
  return s.toLowerCase().replace(/[\s/()]+/g, '_').replace(/[^a-z0-9_]/g, '').replace(/_+$/g, '')
}

function parseYear(title: string): number | null {
  const m = title.match(/\b(19[6-9]\d|20[0-2]\d)\b/)
  return m ? parseInt(m[1]!, 10) : null
}

function parseTitle(title: string) {
  const year = parseYear(title)
  const withoutYear = title.replace(/\b(19[6-9]\d|20[0-2]\d)\b/, '').trim().split(/\s+/)
  return { year, make: withoutYear[0] ?? null, model: withoutYear.slice(1).join(' ') || null }
}

function parseLengthFromSpecs(specs: Record<string, string>): number | null {
  const raw = specs['loa'] ?? specs['length'] ?? specs['length_overall'] ?? null
  if (!raw) return null
  return parseFloat(raw) || null
}

function mapBoatType(s: string): BoatType | null {
  if (!s) return null
  if (s.includes('sail') || s.includes('sloop') || s.includes('ketch')) return BoatType.SAILBOAT
  if (s.includes('power') || s.includes('motor') || s.includes('cruiser')) return BoatType.POWERBOAT
  if (s.includes('catamaran') || s.includes('cat ')) return BoatType.CATAMARAN
  if (s.includes('pontoon')) return BoatType.PONTOON
  if (s.includes('pwc') || s.includes('personal') || s.includes('jet ski')) return BoatType.PWC
  if (s.includes('fish') || s.includes('bass') || s.includes('bay boat')) return BoatType.FISHING
  if (s.includes('house')) return BoatType.HOUSEBOAT
  if (s.includes('inflat') || s.includes('dinghy') || s.includes('rib')) return BoatType.INFLATABLE
  return BoatType.OTHER
}

function mapHullMaterial(s: string): HullMaterial | null {
  if (!s) return null
  if (s.includes('fiberglass') || s.includes('fibreglass') || s.includes('grp')) return HullMaterial.FIBERGLASS
  if (s.includes('aluminum') || s.includes('aluminium')) return HullMaterial.ALUMINUM
  if (s.includes('steel')) return HullMaterial.STEEL
  if (s.includes('wood') || s.includes('teak') || s.includes('mahogany')) return HullMaterial.WOOD
  if (s.includes('composite') || s.includes('carbon')) return HullMaterial.COMPOSITE
  if (s.includes('inflatable') || s.includes('pvc') || s.includes('hypalon')) return HullMaterial.INFLATABLE
  return HullMaterial.OTHER
}

function mapPropulsion(s: string): PropulsionType | null {
  if (!s) return null
  if (s.includes('outboard')) return PropulsionType.OUTBOARD
  if (s.includes('sterndrive') || s.includes('i/o') || s.includes('stern drive')) return PropulsionType.STERNDRIVE
  if (s.includes('inboard')) return PropulsionType.INBOARD
  if (s.includes('sail')) return PropulsionType.SAIL
  if (s.includes('electric')) return PropulsionType.ELECTRIC
  if (s.includes('jet')) return PropulsionType.JET
  return PropulsionType.OTHER
}
