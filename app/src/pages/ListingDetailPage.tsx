import { useParams, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '../lib/api-client.ts'
import PriceHistoryChart from '../components/listing/PriceHistoryChart.tsx'
import PriceTrendBadge from '../components/listing/PriceTrendBadge.tsx'
import ListingCard from '../components/listing/ListingCard.tsx'
import { SOURCE_LABELS } from '@anchordeep/shared'

function formatPrice(cents: number | null) {
  if (cents == null) return 'Price TBD'
  return `$${(cents / 100).toLocaleString()}`
}

export default function ListingDetailPage() {
  const { id } = useParams<{ id: string }>()
  const queryClient = useQueryClient()

  const { data: listing, isLoading, isError } = useQuery({
    queryKey: ['listing', id],
    queryFn: () => apiClient.getListing(id!),
    enabled: !!id,
  })

  const { data: history } = useQuery({
    queryKey: ['listing', id, 'price-history'],
    queryFn: () => apiClient.getListingPriceHistory(id!),
    enabled: !!id,
  })

  const { data: similar } = useQuery({
    queryKey: ['listing', id, 'similar'],
    queryFn: () => apiClient.getSimilarListings(id!),
    enabled: !!id,
  })

  const { data: savedListings } = useQuery({
    queryKey: ['saved-listings'],
    queryFn: () => apiClient.getSavedListings(),
  })
  const isSaved = savedListings?.some((s) => s.listingId === id) ?? false

  const { data: alerts } = useQuery({
    queryKey: ['alerts'],
    queryFn: () => apiClient.getAlerts(),
  })
  const hasAlert = alerts?.some((a) => a.listingId === id) ?? false

  const saveMutation = useMutation<void, Error, void>({
    mutationFn: async () => {
      if (isSaved) await apiClient.unsaveListing(id!)
      else await apiClient.saveListing(id!)
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['saved-listings'] }),
  })

  const alertMutation = useMutation<void, Error, void>({
    mutationFn: async () => {
      if (hasAlert) await apiClient.deleteAlert(id!)
      else await apiClient.createAlert(id!, null)
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['alerts'] }),
  })

  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8 animate-pulse space-y-4">
        <div className="h-72 bg-gray-200 rounded-xl" />
        <div className="h-8 bg-gray-200 rounded w-1/2" />
        <div className="h-6 bg-gray-200 rounded w-1/4" />
      </div>
    )
  }

  if (isError || !listing) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-16 text-center">
        <p className="text-gray-500 text-lg">Listing not found.</p>
        <Link to="/" className="text-ocean-600 hover:underline text-sm mt-2 block">Back to search</Link>
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-8">
      {/* Breadcrumb */}
      <Link to="/" className="text-sm text-ocean-600 hover:underline">&larr; Back to search</Link>

      {/* Hero image */}
      {listing.images.length > 0 && (
        <div className="rounded-xl overflow-hidden bg-gray-100 aspect-video">
          <img
            src={listing.images[0].url}
            alt={`${listing.year} ${listing.make} ${listing.model}`}
            className="w-full h-full object-cover"
          />
        </div>
      )}

      {/* Title + Price */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {listing.year} {listing.make} {listing.model}
          </h1>
          <p className="text-gray-500 mt-1">
            {listing.city && listing.state ? `${listing.city}, ${listing.state}` : listing.state ?? ''}
          </p>
        </div>
        <div className="text-right shrink-0 space-y-2">
          <p className="text-3xl font-bold text-anchor-700">{formatPrice(listing.currentPriceUsd)}</p>
          {listing.status === 'SOLD' && listing.soldPriceUsd && (
            <p className="text-sm text-red-600 font-semibold">
              Sold for {formatPrice(listing.soldPriceUsd)}
            </p>
          )}
          <PriceTrendBadge pct={listing.priceDrop30dPct} />
          {listing.status !== 'SOLD' && (
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => saveMutation.mutate()}
                disabled={saveMutation.isPending}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors border ${
                  isSaved
                    ? 'bg-anchor-700 text-white border-anchor-700 hover:bg-anchor-800'
                    : 'bg-white text-anchor-700 border-anchor-300 hover:bg-anchor-50'
                }`}
              >
                {isSaved ? '★ Saved' : '☆ Save'}
              </button>
              <button
                onClick={() => alertMutation.mutate()}
                disabled={alertMutation.isPending}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors border ${
                  hasAlert
                    ? 'bg-ocean-600 text-white border-ocean-600 hover:bg-ocean-700'
                    : 'bg-white text-ocean-600 border-ocean-300 hover:bg-ocean-50'
                }`}
              >
                {hasAlert ? '🔔 Alert on' : '🔕 Set Alert'}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Key specs grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Type', value: listing.type?.toLowerCase() },
          { label: 'Length', value: listing.lengthFt ? `${listing.lengthFt} ft` : null },
          { label: 'Year', value: listing.year },
          { label: 'Hull', value: listing.hullMaterial?.toLowerCase() },
          { label: 'Propulsion', value: listing.propulsion?.toLowerCase() },
          { label: 'Engine Hours', value: listing.engineHours },
          { label: 'Status', value: listing.status.toLowerCase() },
          { label: 'First Listed', value: new Date(listing.firstSeenAt).toLocaleDateString() },
        ]
          .filter((s) => s.value != null)
          .map((s) => (
            <div key={s.label} className="bg-gray-50 rounded-lg p-3">
              <p className="text-xs text-gray-500 uppercase tracking-wide">{s.label}</p>
              <p className="font-medium text-gray-900 capitalize mt-0.5">{String(s.value)}</p>
            </div>
          ))}
      </div>

      {/* Additional specs from spec table */}
      {listing.specs.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold mb-3">Specifications</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {listing.specs.map((s) => (
              <div key={s.key} className="bg-gray-50 rounded p-2.5">
                <p className="text-xs text-gray-500">{s.label}{s.unit ? ` (${s.unit})` : ''}</p>
                <p className="font-medium text-sm text-gray-900 mt-0.5">{s.value}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Description */}
      <div>
        <h2 className="text-lg font-semibold mb-3">Description</h2>
        <p className="text-gray-700 leading-relaxed whitespace-pre-line">
          {listing.description || <span className="text-gray-400 italic">No description available</span>}
        </p>
      </div>

      {/* Price history chart */}
      <div>
        <h2 className="text-lg font-semibold mb-3">Price History</h2>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <PriceHistoryChart snapshots={history ?? listing.recentSnapshots} soldPriceUsd={listing.soldPriceUsd} />
        </div>
      </div>

      {/* Source links */}
      <div>
        <h2 className="text-lg font-semibold mb-3">Listed On</h2>
        <div className="flex flex-wrap gap-2">
          {listing.sources.map((s) => (
            <a
              key={s.id}
              href={s.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm border transition-colors ${
                s.isActive
                  ? 'border-ocean-400 text-ocean-600 hover:bg-ocean-50'
                  : 'border-gray-300 text-gray-400 line-through'
              }`}
            >
              {SOURCE_LABELS[s.site as keyof typeof SOURCE_LABELS] ?? s.site}
              {s.isActive ? ' ↗' : ' (inactive)'}
            </a>
          ))}
        </div>
      </div>

      {/* Similar listings */}
      {similar && similar.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold mb-3">Similar Boats</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {similar.slice(0, 3).map((l) => (
              <ListingCard key={l.id} listing={l} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
