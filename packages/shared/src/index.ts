// ─── Source Sites ────────────────────────────────────────────────────────────

export enum SourceSite {
  BOAT_TRADER = 'BOAT_TRADER',
  YACHT_WORLD = 'YACHT_WORLD',
  BOATS_COM = 'BOATS_COM',
  EBAY_MOTORS = 'EBAY_MOTORS',
  CRAIGSLIST = 'CRAIGSLIST',
  FACEBOOK_MARKETPLACE = 'FACEBOOK_MARKETPLACE',
}

export const SOURCE_LABELS: Record<SourceSite, string> = {
  [SourceSite.BOAT_TRADER]: 'Boat Trader',
  [SourceSite.YACHT_WORLD]: 'YachtWorld',
  [SourceSite.BOATS_COM]: 'boats.com',
  [SourceSite.EBAY_MOTORS]: 'eBay Motors',
  [SourceSite.CRAIGSLIST]: 'Craigslist',
  [SourceSite.FACEBOOK_MARKETPLACE]: 'Facebook Marketplace',
}

export const RATE_LIMITS_RPM: Record<SourceSite, number> = {
  [SourceSite.BOAT_TRADER]: 10,
  [SourceSite.YACHT_WORLD]: 10,
  [SourceSite.BOATS_COM]: 6,
  [SourceSite.EBAY_MOTORS]: 30,
  [SourceSite.CRAIGSLIST]: 5,
  [SourceSite.FACEBOOK_MARKETPLACE]: 5,
}

// ─── Listing Enums ───────────────────────────────────────────────────────────

export enum ListingStatus {
  ACTIVE = 'ACTIVE',
  SOLD = 'SOLD',
  EXPIRED = 'EXPIRED',
  RELISTED = 'RELISTED',
}

export enum BoatType {
  POWERBOAT = 'POWERBOAT',
  SAILBOAT = 'SAILBOAT',
  PONTOON = 'PONTOON',
  PWC = 'PWC',
  FISHING = 'FISHING',
  HOUSEBOAT = 'HOUSEBOAT',
  CATAMARAN = 'CATAMARAN',
  INFLATABLE = 'INFLATABLE',
  OTHER = 'OTHER',
}

export enum HullMaterial {
  FIBERGLASS = 'FIBERGLASS',
  ALUMINUM = 'ALUMINUM',
  STEEL = 'STEEL',
  WOOD = 'WOOD',
  COMPOSITE = 'COMPOSITE',
  INFLATABLE = 'INFLATABLE',
  OTHER = 'OTHER',
}

export enum PropulsionType {
  OUTBOARD = 'OUTBOARD',
  INBOARD = 'INBOARD',
  STERNDRIVE = 'STERNDRIVE',
  SAIL = 'SAIL',
  ELECTRIC = 'ELECTRIC',
  JET = 'JET',
  OTHER = 'OTHER',
}

export enum SpecDataType {
  NUMBER = 'NUMBER',
  TEXT = 'TEXT',
  BOOLEAN = 'BOOLEAN',
}

// ─── Listing Types ───────────────────────────────────────────────────────────

export interface ListingFilters {
  make?: string
  model?: string
  type?: BoatType
  yearMin?: number
  yearMax?: number
  priceMin?: number
  priceMax?: number
  lengthMin?: number
  lengthMax?: number
  state?: string
  propulsion?: PropulsionType
  hullMaterial?: HullMaterial
  status?: ListingStatus
  sort?: 'price_asc' | 'price_desc' | 'newest' | 'price_drop' | 'days_on_market'
  page?: number
  limit?: number
}

export interface ListingSummary {
  id: string
  make: string | null
  model: string | null
  year: number | null
  type: BoatType | null
  lengthFt: number | null
  currentPriceUsd: number | null
  city: string | null
  state: string | null
  status: ListingStatus
  firstSeenAt: string
  lastSeenAt: string
  soldAt: string | null
  thumbnailUrl: string | null
  sourceCount: number
  priceDrop30dPct: number | null
}

export interface PriceSnapshotDto {
  id: string
  createdAt: string
  priceUsd: number
  status: ListingStatus
  priceChanged: boolean
  priceChangePct: number | null
  prevPriceUsd: number | null
  rawPriceStr: string | null
  site: string
}

export interface ListingDetail extends ListingSummary {
  hullMaterial: HullMaterial | null
  propulsion: PropulsionType | null
  engineHours: number | null
  lat: number | null
  lng: number | null
  soldPriceUsd: number | null
  fingerprintHash: string | null
  description: string | null
  specs: { key: string; label: string; unit: string | null; value: string; valueNumber: number | null }[]
  sources: {
    id: string
    site: string
    sourceUrl: string
    lastScrapedAt: string | null
    isActive: boolean
  }[]
  recentSnapshots: PriceSnapshotDto[]
  images: { url: string; isThumbnail: boolean; sortOrder: number }[]
}

export interface PaginatedListings {
  listings: ListingSummary[]
  total: number
  page: number
  limit: number
  totalPages: number
}

// ─── Scraper Types ───────────────────────────────────────────────────────────

export interface RawListingData {
  externalId: string
  sourceUrl: string
  site: SourceSite
  title: string
  rawPriceStr: string | null
  make: string | null
  model: string | null
  year: number | null
  type: BoatType | null
  lengthFt: number | null
  hullMaterial: HullMaterial | null
  propulsion: PropulsionType | null
  engineHours: number | null
  city: string | null
  state: string | null
  description: string | null
  imageUrls: string[]
  isSold: boolean
  specs: Record<string, string>
  rawJson: Record<string, unknown>
}

export interface NormalizedListing {
  externalId: string
  sourceUrl: string
  site: SourceSite
  make: string | null
  model: string | null
  year: number | null
  type: BoatType | null
  lengthFt: number | null
  hullMaterial: HullMaterial | null
  propulsion: PropulsionType | null
  engineHours: number | null
  city: string | null
  state: string | null
  description: string | null
  priceUsd: number | null
  rawPriceStr: string | null
  status: ListingStatus
  imageUrls: string[]
  specs: Record<string, string>
  rawJson: Record<string, unknown>
}

export interface IngestResult {
  created: number
  updated: number
  priceChanges: number
  soldDetected: number
  errors: number
  errorDetails: string[]
}

// ─── User Feature Types ───────────────────────────────────────────────────────

export interface SavedListingDto {
  id: string
  listingId: string
  createdAt: string
  listing: ListingSummary
}

export interface PriceAlertDto {
  id: string
  listingId: string
  targetPriceUsd: number | null
  notified: boolean
  createdAt: string
  listing: Pick<ListingSummary, 'id' | 'make' | 'model' | 'year' | 'currentPriceUsd' | 'thumbnailUrl'>
}
