import { Link } from 'react-router-dom'
import type { ListingSummary } from '@anchordeep/shared'
import PriceTrendBadge from './PriceTrendBadge.tsx'

interface Props {
  listing: ListingSummary
}

function formatPrice(cents: number | null) {
  if (cents == null) return 'Price TBD'
  return `$${(cents / 100).toLocaleString()}`
}

function daysOnMarket(firstSeenAt: string) {
  const ms = Date.now() - new Date(firstSeenAt).getTime()
  return Math.max(1, Math.floor(ms / 86400000))
}

const PLACEHOLDER = 'https://images.unsplash.com/photo-1567899378494-47b22a2ae96a?w=400&q=60'

export default function ListingCard({ listing }: Props) {
  const days = daysOnMarket(listing.firstSeenAt)
  const lastSeen = listing.lastSeenAt ? new Date(listing.lastSeenAt).toLocaleDateString() : null

  return (
    <Link
      to={`/listings/${listing.id}`}
      className="group block bg-white rounded-xl overflow-hidden shadow-sm border border-gray-200 hover:shadow-md hover:border-ocean-400 transition-all"
    >
      <div className="relative aspect-[4/3] bg-gray-100 overflow-hidden">
        <img
          src={listing.thumbnailUrl ?? PLACEHOLDER}
          alt={`${listing.year} ${listing.make} ${listing.model}`}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          loading="lazy"
        />
        {listing.status === 'SOLD' && (
          <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
            <span className="bg-red-600 text-white font-bold text-lg px-4 py-1 rounded">SOLD</span>
          </div>
        )}
        <div className="absolute top-2 right-2 flex flex-col gap-1.5 items-end">
          {listing.sourceCount > 1 && (
            <span className="bg-black/60 text-white text-xs px-2 py-0.5 rounded">
              {listing.sourceCount} sites
            </span>
          )}
          {listing.status !== 'SOLD' && (
            <span className="bg-ocean-500/90 text-white text-xs px-2 py-0.5 rounded font-medium">
              {listing.status.toLowerCase()}
            </span>
          )}
        </div>
      </div>

      <div className="p-3 space-y-3">
        {/* Title and Price */}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="font-semibold text-gray-900 truncate">
              {listing.year} {listing.make} {listing.model}
            </p>
            <p className="text-sm text-gray-500 truncate">
              {listing.city && listing.state ? `${listing.city}, ${listing.state}` : listing.state ?? '—'}
            </p>
          </div>
          <div className="text-right shrink-0">
            <p className="font-bold text-anchor-700">{formatPrice(listing.currentPriceUsd)}</p>
            <PriceTrendBadge pct={listing.priceDrop30dPct} />
          </div>
        </div>

        {/* Key specs - row 1 */}
        <div className="grid grid-cols-2 gap-2 text-xs">
          {listing.lengthFt && (
            <div className="bg-gray-50 rounded p-1.5">
              <p className="text-gray-500 uppercase tracking-wide text-xs">Length</p>
              <p className="font-medium text-gray-900">{listing.lengthFt} ft</p>
            </div>
          )}
          {listing.type && (
            <div className="bg-gray-50 rounded p-1.5">
              <p className="text-gray-500 uppercase tracking-wide text-xs">Type</p>
              <p className="font-medium text-gray-900 capitalize">{listing.type.toLowerCase()}</p>
            </div>
          )}
        </div>

        {/* Timeline info */}
        <div className="grid grid-cols-2 gap-2 text-xs border-t border-gray-200 pt-2">
          <div>
            <p className="text-gray-500 uppercase tracking-wide">Listed</p>
            <p className="font-medium text-gray-900">{days}d ago</p>
          </div>
          {lastSeen && (
            <div>
              <p className="text-gray-500 uppercase tracking-wide">Last Seen</p>
              <p className="font-medium text-gray-900">{lastSeen}</p>
            </div>
          )}
        </div>
      </div>
    </Link>
  )
}
