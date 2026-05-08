import type { RawListingData, NormalizedListing } from '@anchordeep/shared'
import { ListingStatus } from '@anchordeep/shared'

const SOLD_KEYWORDS = ['sold', 'sale pending', 'under contract', 'no longer available']

export function normalize(raw: RawListingData): NormalizedListing {
  const isSold = raw.isSold || SOLD_KEYWORDS.some((kw) => raw.title?.toLowerCase().includes(kw))

  return {
    externalId: raw.externalId,
    sourceUrl: raw.sourceUrl,
    site: raw.site,
    make: clean(raw.make),
    model: clean(raw.model),
    year: raw.year,
    type: raw.type,
    lengthFt: raw.lengthFt,
    hullMaterial: raw.hullMaterial,
    propulsion: raw.propulsion,
    engineHours: raw.engineHours,
    city: clean(raw.city),
    state: raw.state?.toUpperCase().trim() ?? null,
    description: raw.description ?? null,
    priceUsd: parsePrice(raw.rawPriceStr),
    rawPriceStr: raw.rawPriceStr,
    status: isSold ? ListingStatus.SOLD : ListingStatus.ACTIVE,
    imageUrls: raw.imageUrls,
    specs: raw.specs,
    rawJson: raw.rawJson,
  }
}

function clean(val: string | null | undefined): string | null {
  if (!val) return null
  return val.trim().replace(/\s+/g, ' ') || null
}

/** Converts price string to integer cents. Returns null if unparseable. */
export function parsePrice(raw: string | null | undefined): number | null {
  if (!raw) return null
  // Match first standalone price token: $47,500 or 47500 — do NOT strip all digits
  const match = raw.match(/\$?\s*([\d]{1,3}(?:,[\d]{3})*(?:\.[\d]{1,2})?|\d+)/)
  if (!match) return null
  const dollars = parseInt(match[1]!.replace(/,/g, ''), 10)
  if (isNaN(dollars) || dollars <= 0 || dollars > 100_000_000) return null
  return dollars * 100
}
