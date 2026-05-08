import axios from 'axios'
import type { NormalizedListing, IngestResult } from '@anchordeep/shared'

const client = axios.create({
  baseURL: process.env.API_BASE_URL ?? 'http://localhost:3001',
  headers: { 'x-api-key': process.env.INTERNAL_API_KEY ?? '' },
  timeout: 30_000,
})

export async function sendBatch(listings: NormalizedListing[]): Promise<IngestResult> {
  const { data } = await client.post<IngestResult>('/api/v1/internal/snapshots', { listings })
  return data
}

export interface CheckSourcesResult { fresh: string[]; stale: string[] }

export async function checkSources(
  sources: { site: string; externalId: string }[],
  freshWithinHours?: number
): Promise<CheckSourcesResult> {
  const { data } = await client.post<CheckSourcesResult>('/api/v1/internal/check-sources', {
    sources,
    freshWithinHours,
  })
  return data
}

export async function createScrapeRun(site: string): Promise<string> {
  const { data } = await client.post<{ id: string }>('/api/v1/internal/scrape-runs', { site })
  return data.id
}

export async function updateScrapeRun(
  id: string,
  counts: {
    listingsFound?: number
    listingsNew?: number
    priceChanges?: number
    soldDetected?: number
    errors?: number
    errorLog?: string | Record<string, unknown>
    completed?: boolean
  }
): Promise<void> {
  await client.patch(`/api/v1/internal/scrape-runs/${id}`, counts)
}
