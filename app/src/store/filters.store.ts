import { create } from 'zustand'
import type { ListingFilters } from '@anchordeep/shared'

interface FilterState {
  filters: ListingFilters
  setFilter: <K extends keyof ListingFilters>(key: K, value: ListingFilters[K]) => void
  setFilters: (partial: Partial<ListingFilters>) => void
  resetFilters: () => void
}

const DEFAULT_FILTERS: ListingFilters = {
  sort: 'newest',
  page: 1,
  limit: 24,
}

export const useFilterStore = create<FilterState>((set) => ({
  filters: DEFAULT_FILTERS,

  setFilter: (key, value) =>
    set((state) => ({
      filters: { ...state.filters, [key]: value, page: key === 'page' ? (value as number) : 1 },
    })),

  setFilters: (partial) =>
    set((state) => ({
      filters: { ...state.filters, ...partial, page: 1 },
    })),

  resetFilters: () => set({ filters: DEFAULT_FILTERS }),
}))
