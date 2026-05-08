import * as cheerio from 'cheerio'
import type { RawListingData } from '@anchordeep/shared'
import { BoatType, HullMaterial, PropulsionType, SourceSite } from '@anchordeep/shared'
import { BaseScraper } from './base.scraper.js'
import { browserPool } from '../lib/browser-pool.js'
import { acquireToken } from '../lib/rate-limiter.js'
import { TARGET_MAKES, buildMakeParam, MAX_LENGTH_FT } from '../config/targets.js'

const BASE = 'https://www.yachtworld.com'

export class YachtWorldScraper extends BaseScraper {
  readonly site = SourceSite.YACHT_WORLD
  readonly baseUrl = BASE

  extractExternalId(url: string): string {
    return extractYachtWorldId(url)
  }

  async fetchListingUrls(page: number): Promise<string[]> {
    if (page > 1) return []

    await acquireToken(this.site)

    const makes = buildMakeParam('+').toLowerCase()
    const url = `${BASE}/boats-for-sale/make-${makes}/length-0,${MAX_LENGTH_FT}/`
    const { html, ctx } = await browserPool.fetch(url, {
      waitFor: 'a[href*="/yacht/"], a[href*="/boats/"]',
    })
    await ctx.close()

    const $ = cheerio.load(html)
    const urls: string[] = []

    $('a[href*="/yacht/"], a[href*="/boats/"]').each((_, el) => {
      const href = $(el).attr('href')
      if (!href) return
      if (href.includes('/boats-for-sale') || href.includes('/search') || href.includes('/resources')) return
      const full = href.startsWith('http') ? href : `${BASE}${href}`
      if (!urls.includes(full)) urls.push(full)
    })

    // Fallback: __NEXT_DATA__ listing slugs
    if (!urls.length) {
      try {
        const raw = $('#__NEXT_DATA__').html()
        if (raw) {
          const data = JSON.parse(raw)
          const results: any[] = data?.props?.pageProps?.searchResults?.boats ?? []
          for (const b of results) {
            const slug = b.url ?? b.path
            if (slug) urls.push(slug.startsWith('http') ? slug : `${BASE}${slug}`)
          }
        }
      } catch { /* ignore */ }
    }

    return urls.slice(0, 50)
  }

  async scrapeDetailPage(url: string): Promise<RawListingData> {
    await acquireToken(this.site)

    const { html, ctx } = await browserPool.fetch(url, {
      waitFor: 'h1, [data-testid="price"], .price, [class*="price"]',
      timeout: 60_000,
    })
    await ctx.close()

    const $ = cheerio.load(html)
    const externalId = extractYachtWorldId(url)

    // YachtWorld embeds full listing data in __NEXT_DATA__
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

    let title = listing?.headline ?? listing?.name ?? $('h1').first().text().trim()
    let rawPriceStr: string | null = null
    let description: string | null = null
    const specs: Record<string, string> = {}
    let imageUrls: string[] = []

    if (listing) {
      rawPriceStr = listing.price?.asking != null ? `$${listing.price.asking}` : null
      description = listing.description ?? listing.descriptionBody ?? null

      const attrs = listing.specs ?? listing.attributes ?? {}
      for (const [k, v] of Object.entries(attrs)) {
        if (v != null) specs[slugify(k)] = String(v)
      }

      const pics = listing.images ?? listing.media ?? []
      imageUrls = pics.map((p: any) => p.url ?? p.uri ?? (typeof p === 'string' ? p : null)).filter(Boolean).slice(0, 10)
    }

    // DOM fallback
    if (!rawPriceStr) {
      rawPriceStr =
        $('[data-testid="price"]').first().text().trim() ||
        $('[class*="price"]').first().text().trim() ||
        null
    }

    if (!description) {
      description =
        $('[class*="description"] p').map((_, el) => $(el).text().trim()).get().filter(Boolean).join('\n') ||
        $('[class*="description"]').first().text().trim() ||
        null
      if (description) description = description.slice(0, 3000)
    }

    if (!imageUrls.length) {
      $('img[src*="yachtworld.com"], img[src*="boatsgroup.com"], [class*="gallery"] img').each((_, img) => {
        const src = $(img).attr('src') ?? $(img).attr('data-src')
        if (src && !src.includes('logo') && !imageUrls.includes(src)) imageUrls.push(src)
      })
    }

    $('[class*="spec"] dt, dl dt, [class*="detail"] th').each((_, el) => {
      const key = slugify($(el).text().trim())
      const val = $(el).next('dd, td').text().trim()
      if (key && val && !specs[key]) specs[key] = val
    })

    const isSold =
      listing?.status === 'sold' ||
      $('body').text().toLowerCase().includes('no longer available') ||
      $('[class*="sold"]').length > 0

    const make = listing?.make ?? specs['make'] ?? extractMakeFromUrl(url) ?? null
    const model = listing?.model ?? specs['model'] ?? null

    // Parse year from multiple sources
    let year = listing?.year ? parseInt(listing.year, 10) : (specs['year'] ? parseInt(specs['year'], 10) : parseYear(title))
    if (!year && description) {
      const yearMatch = description.match(/\b(19[6-9]\d|20[0-2]\d)\b/)
      if (yearMatch) year = parseInt(yearMatch[1]!, 10)
    }
    if (!year && url) {
      const urlMatch = url.match(/\/(20\d{2})-/)
      if (urlMatch) year = parseInt(urlMatch[1]!, 10)
    }

    // Parse length from description, title, or specs
    let lengthFt = listing?.length ? parseFloat(listing.length) : parseLengthFromSpecs(specs)
    if (!lengthFt && description) {
      const lenMatch = description.match(/\b(\d{1,3}(?:\.\d{1,2})?)\s*(?:feet|ft|')\b/i)
      if (lenMatch) lengthFt = parseFloat(lenMatch[1]!)
    }
    if (!lengthFt && title) {
      const titleMatch = title.match(/\b(\d{1,3}(?:\.\d{1,2})?)\s*(?:feet|ft|')\b/i)
      if (titleMatch) lengthFt = parseFloat(titleMatch[1]!)
    }

    const engineHours = listing?.engineHours ?? (specs['engine_hours'] ? parseInt(specs['engine_hours'], 10) : null)
    const city = listing?.location?.city ?? null
    const state = listing?.location?.stateCode ?? listing?.location?.state ?? null

    // Combine sources for better spec detection, including URL hints
    const urlHint = url.toLowerCase()
    const combinedText = (title + ' ' + description + ' ' + Object.values(specs).join(' ') + ' ' + urlHint).toLowerCase()
    const classVal = (listing?.boatClass ?? listing?.type ?? listing?.category ?? specs['class'] ?? combinedText).toLowerCase()
    const hullRaw = (listing?.hullMaterial ?? specs['hull_material'] ?? specs['hull'] ?? combinedText).toLowerCase()
    const driveRaw = (listing?.driveType ?? specs['drive_type'] ?? specs['propulsion'] ?? combinedText).toLowerCase()

    return {
      externalId,
      sourceUrl: url,
      site: this.site,
      title,
      rawPriceStr,
      make,
      model,
      year,
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
      rawJson: listing ? { source: 'next_data' } : { source: 'dom' },
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

function extractYachtWorldId(url: string): string {
  const m = url.match(/\/(?:yacht|boats)\/[^/]+-(\d{5,})\/?/)
  if (m) return m[1]!
  return url.split('/').filter(Boolean).pop()?.split('?')[0] ?? url
}

function slugify(s: string) {
  return s.toLowerCase().replace(/[\s/()]+/g, '_').replace(/[^a-z0-9_]/g, '').replace(/_+$/g, '')
}

function parseYear(title: string): number | null {
  const m = title.match(/\b(19[6-9]\d|20[0-2]\d)\b/)
  return m ? parseInt(m[1]!, 10) : null
}

function parseLengthFromSpecs(specs: Record<string, string>): number | null {
  const raw = specs['loa'] ?? specs['length'] ?? specs['length_overall'] ?? null
  if (!raw) return null
  return parseFloat(raw) || null
}

function mapBoatType(s: string): BoatType | null {
  if (!s) return null
  if (s.includes('sail') || s.includes('sloop') || s.includes('ketch') || s.includes('yawl') || s.includes('cutter')) return BoatType.SAILBOAT
  if (s.includes('power') || s.includes('motor') || s.includes('cruiser') || s.includes('express')) return BoatType.POWERBOAT
  if (s.includes('catamaran') || s.includes('cat ')) return BoatType.CATAMARAN
  if (s.includes('pontoon')) return BoatType.PONTOON
  if (s.includes('fish')) return BoatType.FISHING
  if (s.includes('house')) return BoatType.HOUSEBOAT
  return BoatType.OTHER
}

function mapHullMaterial(s: string): HullMaterial | null {
  if (!s) return null
  if (s.includes('fiberglass') || s.includes('grp')) return HullMaterial.FIBERGLASS
  if (s.includes('aluminum') || s.includes('aluminium')) return HullMaterial.ALUMINUM
  if (s.includes('steel')) return HullMaterial.STEEL
  if (s.includes('wood') || s.includes('teak') || s.includes('mahogany')) return HullMaterial.WOOD
  if (s.includes('composite') || s.includes('carbon')) return HullMaterial.COMPOSITE
  return HullMaterial.OTHER
}

function mapPropulsion(s: string): PropulsionType | null {
  if (!s) return null
  if (s.includes('outboard')) return PropulsionType.OUTBOARD
  if (s.includes('sterndrive') || s.includes('i/o')) return PropulsionType.STERNDRIVE
  if (s.includes('inboard')) return PropulsionType.INBOARD
  if (s.includes('sail')) return PropulsionType.SAIL
  if (s.includes('electric')) return PropulsionType.ELECTRIC
  if (s.includes('jet')) return PropulsionType.JET
  return PropulsionType.OTHER
}
