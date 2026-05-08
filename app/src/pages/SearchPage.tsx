import { useQuery } from '@tanstack/react-query'
import { useFilterStore } from '../store/filters.store.ts'
import { apiClient } from '../lib/api-client.ts'
import FilterSidebar from '../components/search/FilterSidebar.tsx'
import ListingCard from '../components/listing/ListingCard.tsx'

const SORT_OPTIONS = [
  { value: 'newest', label: 'Newest' },
  { value: 'price_asc', label: 'Price: Low to High' },
  { value: 'price_desc', label: 'Price: High to Low' },
  { value: 'price_drop', label: 'Recent Price Drops' },
  { value: 'days_on_market', label: 'Days on Market' },
]

export default function SearchPage() {
  const { filters, setFilter } = useFilterStore()

  const { data, isLoading, isError } = useQuery({
    queryKey: ['listings', filters],
    queryFn: () => apiClient.getListings(filters),
    placeholderData: (prev) => prev,
  })

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      <div className="flex gap-8">
        <FilterSidebar />

        <div className="flex-1 min-w-0">
          {/* Toolbar */}
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm text-gray-600">
              {isLoading ? 'Loading...' : data ? `${data.total.toLocaleString()} boats found` : ''}
            </p>
            <div className="flex items-center gap-2">
              <label className="text-sm text-gray-600">Sort:</label>
              <select
                value={filters.sort ?? 'newest'}
                onChange={(e) => setFilter('sort', e.target.value as any)}
                className="border rounded px-2 py-1 text-sm bg-white"
              >
                {SORT_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Grid */}
          {isError && (
            <div className="text-red-600 text-sm p-4 bg-red-50 rounded">Failed to load listings. Is the API running?</div>
          )}

          {isLoading && !data && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="bg-white rounded-xl border border-gray-200 overflow-hidden animate-pulse">
                  <div className="aspect-[4/3] bg-gray-200" />
                  <div className="p-3 space-y-2">
                    <div className="h-4 bg-gray-200 rounded w-3/4" />
                    <div className="h-3 bg-gray-200 rounded w-1/2" />
                  </div>
                </div>
              ))}
            </div>
          )}

          {data && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {data.listings.map((listing) => (
                  <ListingCard key={listing.id} listing={listing} />
                ))}
              </div>

              {data.listings.length === 0 && (
                <div className="text-center py-16 text-gray-500">
                  No boats match your filters. Try broadening your search.
                </div>
              )}

              {/* Pagination */}
              {data.totalPages > 1 && (
                <div className="mt-8 flex justify-center gap-2">
                  <button
                    disabled={filters.page === 1}
                    onClick={() => setFilter('page', (filters.page ?? 1) - 1)}
                    className="px-4 py-2 text-sm border rounded disabled:opacity-40 hover:bg-gray-50"
                  >
                    Previous
                  </button>
                  <span className="px-4 py-2 text-sm text-gray-600">
                    Page {filters.page ?? 1} of {data.totalPages}
                  </span>
                  <button
                    disabled={(filters.page ?? 1) >= data.totalPages}
                    onClick={() => setFilter('page', (filters.page ?? 1) + 1)}
                    className="px-4 py-2 text-sm border rounded disabled:opacity-40 hover:bg-gray-50"
                  >
                    Next
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
