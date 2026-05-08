import axios from 'axios'
import * as cheerio from 'cheerio'
import type { RawListingData } from '@anchordeep/shared'
import { BoatType, PropulsionType, SourceSite } from '@anchordeep/shared'
import { BaseScraper } from './base.scraper.js'
import { acquireToken } from '../lib/rate-limiter.js'
import { TARGET_MAKES, MAX_LENGTH_FT } from '../config/targets.js'

// Geographic search centers with 500mi radius.
// More regions (Caribbean islands) will be added as confirmed.
const CL_REGIONS = [
  { subdomain: 'keys', label: 'Florida / Caribbean', lat: 24.8328, lon: -81.9925, radius: 500 },
]

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml',
  'Accept-Language': 'en-US,en;q=0.9',
}

export class CraigslistScraper extends BaseScraper {
  readonly site = SourceSite.CRAIGSLIST
  readonly baseUrl = 'https://craigslist.org'

  extractExternalId(url: string): string {
    return extractCraigslistId(url)
  }

  /**
   * page maps to a target make (1=Lagoon, 2=Leopard, 3=Fountaine Pajot).
   * Each make is searched across all CL_REGIONS using auto_make_model + lat/lon radius.
   */
  async fetchListingUrls(page: number): Promise<string[]> {
    const target = TARGET_MAKES[page - 1]
    if (!target) return []

    const allUrls: string[] = []

    for (const region of CL_REGIONS) {
      await acquireToken(this.site)
      try {
        const searchUrl = `https://${region.subdomain}.craigslist.org/search/boa` +
          `?auto_make_model=${encodeURIComponent(target.make)}` +
          `&lat=${region.lat}&lon=${region.lon}&search_distance=${region.radius}`

        const { data } = await axios.get(searchUrl, { headers: HEADERS, timeout: 12_000 })
        const $ = cheerio.load(data)

        $('a.cl-app-anchor[href*="/boa/"], li.cl-static-search-result a[href*="/boa/"]').each((_, el) => {
          const href = $(el).attr('href')
          if (href && !allUrls.includes(href)) allUrls.push(href)
        })

        $('a[href*=".craigslist.org/boa/"]').each((_, el) => {
          const href = $(el).attr('href')
          if (href && href.includes('/boa/') && !allUrls.includes(href)) allUrls.push(href)
        })
      } catch (err: any) {
        console.warn(`[craigslist] ${region.subdomain} "${target.make}" search failed: ${err.message}`)
      }
    }

    return allUrls
  }

  async scrapeDetailPage(url: string): Promise<RawListingData> {
    await acquireToken(this.site)

    // Jitter: Craigslist blocks fast sequential requests
    await sleep(1200 + Math.random() * 800)

    let data: string
    try {
      const resp = await axios.get(url, { headers: HEADERS, timeout: 12_000 })
      data = resp.data
    } catch (err: any) {
      if (err?.response?.status === 404) {
        return makeExpiredListing(url)
      }
      throw err
    }

    const $ = cheerio.load(data)

    // Craigslist listing ID is in URL: https://city.craigslist.org/boa/d/title/1234567890.html
    const externalId = extractCraigslistId(url)

    const title = $('span#titletextonly, h1.postingtitle span.titletextonly, h1.title-blob').first().text().trim()
      || $('title').text().replace(' - craigslist', '').trim()

    const rawPriceStr = $('.price').first().text().trim() || null

    // Craigslist listing body — description text
    const description = ($('#postingbody').text() ?? '').trim() || null

    const isSold = title.toLowerCase().includes('sold') || $('[class*="removed"]').length > 0

    // Parse attrs table (some CL posts have structured data)
    const attrs: Record<string, string> = {}
    $('p.attrgroup span').each((_, el) => {
      const txt = $(el).text().trim()
      const [k, ...rest] = txt.split(':')
      if (k && rest.length) attrs[slugify(k)] = rest.join(':').trim()
      else if (txt) attrs[`attr_${Object.keys(attrs).length}`] = txt
    })

    // Images
    const imageUrls: string[] = []
    $('img[src*="craigslist.org"]').each((_, img) => {
      const src = $(img).attr('src')
      if (src && !src.includes('safe') && !src.includes('logo') && !imageUrls.includes(src)) {
        // Convert thumbnail URLs to full size: _300.jpg → _600.jpg
        imageUrls.push(src.replace(/_\d+\.jpg$/, '_600.jpg'))
      }
    })

    // Location from listing
    const locationEl = $('div.mapaddress, .postinginfo:contains("google map")').first().text().trim()
    const mapNotice = $('div.mapbox p').text().trim()
    const locationText = locationEl || mapNotice || ''

    // Parse year/make/model from title — CL listings vary wildly in format
    const parsed = parseCraigslistTitle(title)

    // Infer boat type from title/description
    const combined = (title + ' ' + description + ' ' + Object.values(attrs).join(' ')).toLowerCase()
    const type = inferBoatType(combined)
    const propulsion = inferPropulsion(combined)

    // Region label from URL subdomain
    const subdomain = url.match(/https?:\/\/([^.]+)\.craigslist/)?.[1] ?? ''
    const region = CL_REGIONS.find(r => r.subdomain === subdomain)

    return {
      externalId,
      sourceUrl: url,
      site: this.site,
      title,
      rawPriceStr,
      make: parsed.make,
      model: parsed.model,
      year: parsed.year,
      type,
      lengthFt: parsed.lengthFt,
      hullMaterial: null,
      propulsion,
      engineHours: null,
      city: region?.label ?? subdomain ?? null,
      state: null,
      description,
      imageUrls: imageUrls.slice(0, 10),
      isSold,
      specs: attrs,
      rawJson: { subdomain, locationText },
    }
  }

  detectSold(raw: RawListingData): boolean {
    return raw.isSold || (raw.rawJson as any)?.removed === true
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function extractCraigslistId(url: string): string {
  const m = url.match(/\/(\d{10,})(\.html)?$/)
  if (m) return m[1]!
  return url.split('/').filter(Boolean).pop()?.replace('.html', '') ?? url
}

function makeExpiredListing(url: string): RawListingData {
  return {
    externalId: extractCraigslistId(url),
    sourceUrl: url,
    site: SourceSite.CRAIGSLIST,
    title: '',
    rawPriceStr: null,
    make: null, model: null, year: null, type: null,
    lengthFt: null, hullMaterial: null, propulsion: null, engineHours: null,
    city: null, state: null, description: null, imageUrls: [],
    isSold: true,
    specs: {},
    rawJson: { removed: true },
  }
}

/** Craigslist titles are free-form: "2018 Sea Ray 240 Sundancer - 24ft outboard" */
function parseCraigslistTitle(title: string) {
  const yearMatch = title.match(/\b(19[6-9]\d|20[0-2]\d)\b/)
  const year = yearMatch ? parseInt(yearMatch[1]!, 10) : null

  const lengthMatch = title.match(/\b(\d{1,2}(?:\.\d)?)\s*(?:ft|foot|')\b/i)
  const lengthFt = lengthMatch ? parseFloat(lengthMatch[1]!) : null

  const withoutYear = title.replace(/\b(19[6-9]\d|20[0-2]\d)\b/, '').trim()
  const parts = withoutYear.split(/\s+/).filter(Boolean)

  const KNOWN_MAKES = [
    'Sea Ray', 'Boston Whaler', 'Beneteau', 'Catalina', 'Grady-White', 'Yamaha',
    'Sea-Doo', 'Jeanneau', 'Hunter', 'Chaparral', 'Regal', 'Cobalt', 'Malibu',
    'MasterCraft', 'Tige', 'Four Winns', 'Monterey', 'Rinker', 'Wellcraft',
    'Bayliner', 'Chris-Craft', 'Ranger', 'Tracker', 'Lund', 'Alumacraft',
    'Harris', 'Manitou', 'Sun Tracker', 'Sailfish', 'Robalo', 'Mako',
    'Pursuit', 'Contender', 'Everglades', 'Scout', 'Cobia', 'Tidewater',
  ]

  let make: string | null = null
  let modelStart = 0

  for (const knownMake of KNOWN_MAKES) {
    if (title.toLowerCase().includes(knownMake.toLowerCase())) {
      make = knownMake
      const idx = withoutYear.toLowerCase().indexOf(knownMake.toLowerCase())
      modelStart = idx + knownMake.length
      break
    }
  }

  if (!make && parts[0]) make = parts[0]

  const modelStr = withoutYear.slice(modelStart).trim().split(/[-–|]/)[0]?.trim() ?? null
  const model = modelStr && modelStr !== make ? modelStr.slice(0, 60) : null

  return { year, make, model, lengthFt }
}

function inferBoatType(text: string): BoatType | null {
  if (text.includes('pontoon')) return BoatType.PONTOON
  if (text.includes('sailboat') || text.includes('sloop') || text.includes('catamaran') || text.includes('ketch')) return BoatType.SAILBOAT
  if (text.includes('pwc') || text.includes('jet ski') || text.includes('waverunner') || text.includes('seadoo')) return BoatType.PWC
  if (text.includes('bass boat') || text.includes('fishing boat') || text.includes('walleye') || text.includes('bay boat')) return BoatType.FISHING
  if (text.includes('houseboat')) return BoatType.HOUSEBOAT
  return BoatType.POWERBOAT  // reasonable default for CL boat category
}

function inferPropulsion(text: string): PropulsionType | null {
  if (text.includes('outboard') || text.includes('o/b')) return PropulsionType.OUTBOARD
  if (text.includes('sterndrive') || text.includes('i/o') || text.includes('inboard/out')) return PropulsionType.STERNDRIVE
  if (text.includes('inboard')) return PropulsionType.INBOARD
  if (text.includes('sailboat') || text.includes('sail')) return PropulsionType.SAIL
  if (text.includes('electric') || text.includes('trolling')) return PropulsionType.ELECTRIC
  if (text.includes('jet drive') || text.includes('water jet')) return PropulsionType.JET
  return null
}

function slugify(s: string) {
  return s.toLowerCase().replace(/[\s/()]+/g, '_').replace(/[^a-z0-9_]/g, '').replace(/_+$/g, '')
}

function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms))
}
