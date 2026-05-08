import type { RawListingData, NormalizedListing } from '@anchordeep/shared'
import type { SourceSite } from '@anchordeep/shared'

export abstract class BaseScraper {
  abstract readonly site: SourceSite
  abstract readonly baseUrl: string

  /** Returns listing URLs from a search results page */
  abstract fetchListingUrls(page: number): Promise<string[]>

  /** Scrapes one detail page and returns raw data */
  abstract scrapeDetailPage(url: string): Promise<RawListingData>

  /** Extracts the site-specific externalId from a detail page URL */
  abstract extractExternalId(url: string): string

  /** Override to add source-specific sold detection heuristics */
  detectSold(raw: RawListingData): boolean {
    return raw.isSold
  }
}
