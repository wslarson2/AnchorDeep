import type { SourceSite } from '../constants/sources'
import type { BoatType, HullMaterial, ListingStatus, PropulsionType } from './listing.types'

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

export interface SnapshotWriteResult {
  listingId: string
  isNew: boolean
  priceChanged: boolean
  statusChanged: boolean
  priceChangePct: number | null
}

export interface IngestPayload {
  scrapeRunId?: string
  listings: RawListingData[]
}

export interface IngestResult {
  created: number
  updated: number
  priceChanges: number
  soldDetected: number
  errors: number
  errorDetails: string[]
}
