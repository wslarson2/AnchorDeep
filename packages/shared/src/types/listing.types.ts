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
