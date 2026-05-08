import axios from 'axios'
import type {
  PaginatedListings,
  ListingDetail,
  PriceSnapshotDto,
  ListingSummary,
  ListingFilters,
  SavedListingDto,
  PriceAlertDto,
} from '@anchordeep/shared'

const api = axios.create({
  baseURL: '/api/v1',
  headers: { 'Content-Type': 'application/json' },
})

// Injected by the Auth0 hook after login
let _getAccessToken: (() => Promise<string>) | null = null

export function setTokenProvider(fn: () => Promise<string>) {
  _getAccessToken = fn
}

api.interceptors.request.use(async (config) => {
  if (_getAccessToken) {
    try {
      const token = await _getAccessToken()
      config.headers.Authorization = `Bearer ${token}`
    } catch {
      // unauthenticated — proceed without token
    }
  }
  return config
})

function toParams(filters: ListingFilters): Record<string, string> {
  return Object.fromEntries(
    Object.entries(filters)
      .filter(([, v]) => v != null && v !== '')
      .map(([k, v]) => [k, String(v)])
  )
}

export const apiClient = {
  // ─── Listings ──────────────────────────────────────────────────────────────

  getListings: async (filters: ListingFilters): Promise<PaginatedListings> => {
    const { data } = await api.get('/listings', { params: toParams(filters) })
    return data
  },

  getListing: async (id: string): Promise<ListingDetail> => {
    const { data } = await api.get(`/listings/${id}`)
    return data
  },

  getListingPriceHistory: async (id: string): Promise<PriceSnapshotDto[]> => {
    const { data } = await api.get(`/listings/${id}/price-history`)
    return data
  },

  getSimilarListings: async (id: string): Promise<ListingSummary[]> => {
    const { data } = await api.get(`/listings/${id}/similar`)
    return data
  },

  getSearchSuggestions: async (q: string): Promise<{ makes: string[]; models: string[] }> => {
    const { data } = await api.get('/search/suggestions', { params: { q } })
    return data
  },

  getMarketSummary: async (params: { make?: string; model?: string; state?: string }) => {
    const { data } = await api.get('/analytics/market-summary', { params })
    return data
  },

  // ─── Saved Listings ────────────────────────────────────────────────────────

  getSavedListings: async (): Promise<SavedListingDto[]> => {
    const { data } = await api.get('/me/saved-listings')
    return data
  },

  saveListing: async (listingId: string): Promise<{ id: string }> => {
    const { data } = await api.post('/me/saved-listings', { listingId })
    return data
  },

  unsaveListing: async (listingId: string): Promise<void> => {
    await api.delete(`/me/saved-listings/${listingId}`)
  },

  // ─── Price Alerts ──────────────────────────────────────────────────────────

  getAlerts: async (): Promise<PriceAlertDto[]> => {
    const { data } = await api.get('/me/alerts')
    return data
  },

  createAlert: async (listingId: string, targetPriceUsd?: number | null): Promise<{ id: string }> => {
    const { data } = await api.post('/me/alerts', { listingId, targetPriceUsd })
    return data
  },

  deleteAlert: async (listingId: string): Promise<void> => {
    await api.delete(`/me/alerts/${listingId}`)
  },
}
