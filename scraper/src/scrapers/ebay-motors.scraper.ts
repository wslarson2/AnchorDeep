import axios from 'axios'
import type { RawListingData } from '@anchordeep/shared'
import { BoatType, HullMaterial, PropulsionType, SourceSite } from '@anchordeep/shared'
import { BaseScraper } from './base.scraper.js'
import { acquireToken } from '../lib/rate-limiter.js'

// eBay Finding API — boat categories under eBay Motors
const BOAT_CATEGORIES = [
  { id: '26429', name: 'Powerboats & Motorboats' },
  { id: '26501', name: 'Sailboats' },
  { id: '78817', name: 'Personal Watercraft' },
  { id: '76038', name: 'Pontoon Boats' },
  { id: '63747', name: 'Fishing Boats' },
]

const FINDING_API = 'https://svcs.ebay.com/services/search/FindingService/v1'
const SHOPPING_API = 'https://open.api.ebay.com/shopping'

function mapBoatType(categoryId: string): BoatType {
  switch (categoryId) {
    case '26429': return BoatType.POWERBOAT
    case '26501': return BoatType.SAILBOAT
    case '78817': return BoatType.PWC
    case '76038': return BoatType.PONTOON
    case '63747': return BoatType.FISHING
    default:      return BoatType.OTHER
  }
}

function mapCondition(condition: string | undefined): boolean {
  // eBay items sold are listed with "Completed" status
  return condition === 'Completed'
}

function parseYear(title: string): number | null {
  const m = title.match(/\b(19[6-9]\d|20[0-2]\d)\b/)
  return m ? parseInt(m[1], 10) : null
}

function parseLengthFt(title: string, specs: Record<string, string>): number | null {
  const fromSpecs = specs['length_ft'] ?? specs['length'] ?? specs['boat_length']
  if (fromSpecs) {
    const n = parseFloat(fromSpecs)
    if (!isNaN(n)) return n
  }
  // Try to extract from title e.g. "22ft", "22 ft", "22'"
  const m = title.match(/\b(\d{1,2}(?:\.\d)?)\s*(?:ft|foot|')\b/i)
  return m ? parseFloat(m[1]) : null
}

function extractState(location: string | undefined): string | null {
  if (!location) return null
  // eBay location is often "City, ST" or "City, State"
  const m = location.match(/,\s*([A-Z]{2})$/)
  if (m) return m[1]
  // Try full state names
  const stateMap: Record<string, string> = {
    'Florida': 'FL', 'California': 'CA', 'Texas': 'TX', 'New York': 'NY',
    'Michigan': 'MI', 'Washington': 'WA', 'North Carolina': 'NC', 'Maryland': 'MD',
  }
  for (const [name, abbr] of Object.entries(stateMap)) {
    if (location.includes(name)) return abbr
  }
  return null
}

function extractCity(location: string | undefined): string | null {
  if (!location) return null
  return location.split(',')[0]?.trim() ?? null
}

export class EbayMotorsScraper extends BaseScraper {
  readonly site = SourceSite.EBAY_MOTORS
  readonly baseUrl = 'https://www.ebay.com'

  private appId: string

  constructor(appId: string) {
    super()
    this.appId = appId
  }

  extractExternalId(url: string): string {
    // eBay URLs: https://www.ebay.com/itm/123456789
    const m = url.match(/\/itm\/(\d+)/)
    if (m) return m[1]!
    return url.split('/').filter(Boolean).pop()?.split('?')[0] ?? url
  }

  /** Fetches listing IDs from search results for all boat categories */
  async fetchListingUrls(page: number): Promise<string[]> {
    const urls: string[] = []

    for (const category of BOAT_CATEGORIES) {
      await acquireToken(this.site)

      try {
        const params = new URLSearchParams({
          'OPERATION-NAME': 'findItemsAdvanced',
          'SERVICE-VERSION': '1.13.0',
          'SECURITY-APPNAME': this.appId,
          'RESPONSE-DATA-FORMAT': 'JSON',
          'REST-PAYLOAD': '',
          'categoryId': category.id,
          'paginationInput.entriesPerPage': '100',
          'paginationInput.pageNumber': String(page),
          'sortOrder': 'StartTimeNewest',
          'itemFilter(0).name': 'ListingType',
          'itemFilter(0).value(0)': 'FixedPrice',
          'itemFilter(0).value(1)': 'Auction',
          'itemFilter(0).value(2)': 'AuctionWithBIN',
          'outputSelector(0)': 'PictureURLLarge',
          'outputSelector(1)': 'SellerInfo',
        })

        const { data } = await axios.get(`${FINDING_API}?${params}`)
        const items = data?.findItemsAdvancedResponse?.[0]?.searchResult?.[0]?.item ?? []

        for (const item of items) {
          const itemId = item.itemId?.[0]
          if (itemId) {
            urls.push(`https://www.ebay.com/itm/${itemId}`)
          }
        }
      } catch (err) {
        console.error(`eBay category ${category.id} page ${page} failed:`, (err as Error).message)
      }
    }

    return urls
  }

  /** Gets full item details via Shopping API */
  async scrapeDetailPage(url: string): Promise<RawListingData> {
    const itemId = url.split('/itm/')[1]?.split('?')[0]
    if (!itemId) throw new Error(`Cannot extract itemId from URL: ${url}`)

    await acquireToken(this.site)

    const params = new URLSearchParams({
      callname: 'GetSingleItem',
      responseencoding: 'JSON',
      appid: this.appId,
      siteid: '0',
      version: '967',
      ItemID: itemId,
      IncludeSelector: 'Description,ItemSpecifics,PictureURL',
    })

    const { data } = await axios.get(`${SHOPPING_API}?${params}`)
    const item = data?.Item

    if (!item) throw new Error(`eBay item ${itemId} returned no data`)

    const isSold = item.ListingStatus === 'Completed' || item.QuantitySold > 0
    const title: string = item.Title ?? ''
    const location: string = item.Location ?? ''

    // Parse ItemSpecifics into a flat key-value map
    const specs: Record<string, string> = {}
    const specifics = item.ItemSpecifics?.NameValueList ?? []
    for (const nv of specifics) {
      const key = String(nv.Name ?? '').toLowerCase().replace(/\s+/g, '_')
      const val = Array.isArray(nv.Value) ? nv.Value[0] : nv.Value
      if (key && val) specs[key] = String(val)
    }

    const make = specs['make'] ?? specs['brand'] ?? specs['manufacturer'] ?? extractMakeFromTitle(title)
    const model = specs['model'] ?? specs['model_number'] ?? null

    // Parse year from multiple sources
    let year = specs['year'] ? parseInt(specs['year'], 10) : parseYear(title)
    if (!year && title) {
      const urlMatch = title.match(/\b(19[6-9]\d|20[0-2]\d)\b/)
      if (urlMatch) year = parseInt(urlMatch[1]!, 10)
    }

    // Parse specs from combined text when direct specs unavailable
    const urlHint = url.toLowerCase()
    const combinedText = (title + ' ' + Object.values(specs).join(' ') + ' ' + urlHint).toLowerCase()

    // Map eBay hull material values to our enum
    const hullRaw = (specs['hull_material'] ?? specs['material'] ?? combinedText).toLowerCase()
    const hullMaterial = mapHullMaterial(hullRaw)

    // Map propulsion
    const propRaw = (specs['drive_type'] ?? specs['engine_type'] ?? specs['propulsion'] ?? combinedText).toLowerCase()
    const propulsion = mapPropulsion(propRaw)

    const engineHoursRaw = specs['engine_hours'] ?? specs['hours'] ?? null
    const engineHours = engineHoursRaw ? parseInt(engineHoursRaw, 10) : null

    // Category-based boat type
    const catId = String(item.PrimaryCategory?.CategoryID ?? '')
    const type = mapBoatType(catId)

    const priceRaw = item.ConvertedCurrentPrice?.Value ?? item.CurrentPrice?.Value
    const rawPriceStr = priceRaw != null ? `$${priceRaw}` : null

    const imageUrls: string[] = []
    if (item.PictureURL) {
      const pics = Array.isArray(item.PictureURL) ? item.PictureURL : [item.PictureURL]
      imageUrls.push(...pics.slice(0, 10))
    }

    return {
      externalId: itemId,
      sourceUrl: url,
      site: this.site,
      title,
      rawPriceStr,
      make,
      model,
      year,
      type,
      lengthFt: parseLengthFt(title, specs),
      hullMaterial,
      propulsion,
      engineHours,
      city: extractCity(location),
      state: extractState(location),
      description: null, // skip large HTML description
      imageUrls,
      isSold,
      specs,
      rawJson: item,
    }
  }

  detectSold(raw: RawListingData): boolean {
    return raw.isSold || (raw.rawJson as any)?.ListingStatus === 'Completed'
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function extractMakeFromTitle(title: string): string | null {
  const KNOWN_MAKES = [
    'Sea Ray','Boston Whaler','Beneteau','Catalina','Grady-White','Yamaha',
    'Sea-Doo','Jeanneau','Hunter','Chaparral','Regal','Cobalt','Malibu',
    'MasterCraft','Tige','Four Winns','Monterey','Rinker','Wellcraft',
    'Bayliner','Chris-Craft','Ranger','Tracker','Lund','Alumacraft',
    'Harris','Pontoon','Manitou','Sun Tracker','Godfrey',
  ]
  for (const make of KNOWN_MAKES) {
    if (title.toLowerCase().includes(make.toLowerCase())) return make
  }
  return null
}

function mapHullMaterial(raw: string): HullMaterial | null {
  if (!raw) return null
  if (raw.includes('fiberglass') || raw.includes('fibreglass') || raw.includes('gel coat')) return HullMaterial.FIBERGLASS
  if (raw.includes('aluminum') || raw.includes('aluminium')) return HullMaterial.ALUMINUM
  if (raw.includes('steel')) return HullMaterial.STEEL
  if (raw.includes('wood') || raw.includes('cedar') || raw.includes('mahogany')) return HullMaterial.WOOD
  if (raw.includes('composite') || raw.includes('carbon')) return HullMaterial.COMPOSITE
  if (raw.includes('inflatable') || raw.includes('pvc') || raw.includes('hypalon')) return HullMaterial.INFLATABLE
  return HullMaterial.OTHER
}

function mapPropulsion(raw: string): PropulsionType | null {
  if (!raw) return null
  if (raw.includes('outboard')) return PropulsionType.OUTBOARD
  if (raw.includes('inboard') && raw.includes('out')) return PropulsionType.STERNDRIVE
  if (raw.includes('inboard')) return PropulsionType.INBOARD
  if (raw.includes('sterndrive') || raw.includes('stern drive') || raw.includes('i/o')) return PropulsionType.STERNDRIVE
  if (raw.includes('sail')) return PropulsionType.SAIL
  if (raw.includes('electric')) return PropulsionType.ELECTRIC
  if (raw.includes('jet')) return PropulsionType.JET
  return PropulsionType.OTHER
}
