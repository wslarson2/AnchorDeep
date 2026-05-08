import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { apiClient } from '../lib/api-client.ts'

function formatPrice(cents: number | null) {
  if (cents == null) return '—'
  return `$${(cents / 100).toLocaleString()}`
}

export default function AlertsPage() {
  const queryClient = useQueryClient()

  const { data: alerts, isLoading } = useQuery({
    queryKey: ['alerts'],
    queryFn: () => apiClient.getAlerts(),
  })

  const remove = useMutation({
    mutationFn: (listingId: string) => apiClient.deleteAlert(listingId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['alerts'] }),
  })

  if (isLoading) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-8 space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-20 bg-gray-100 rounded-xl animate-pulse" />
        ))}
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Price Alerts</h1>
        <span className="text-sm text-gray-500">{alerts?.length ?? 0} active</span>
      </div>

      {!alerts?.length ? (
        <div className="text-center py-20">
          <p className="text-gray-400 text-lg mb-2">No price alerts set</p>
          <p className="text-gray-400 text-sm mb-4">
            Open any listing and click "Set Alert" to get notified when the price drops.
          </p>
          <Link to="/" className="text-ocean-600 hover:underline text-sm">Browse boats</Link>
        </div>
      ) : (
        <div className="space-y-3">
          {alerts.map((alert) => (
            <div
              key={alert.id}
              className="flex items-center gap-4 p-4 bg-white border border-gray-200 rounded-xl shadow-sm"
            >
              {alert.listing.thumbnailUrl ? (
                <img
                  src={alert.listing.thumbnailUrl}
                  alt=""
                  className="w-16 h-16 rounded-lg object-cover shrink-0 bg-gray-100"
                />
              ) : (
                <div className="w-16 h-16 rounded-lg bg-gray-100 shrink-0" />
              )}

              <div className="flex-1 min-w-0">
                <Link
                  to={`/listings/${alert.listingId}`}
                  className="font-semibold text-gray-900 hover:text-ocean-600 transition-colors truncate block"
                >
                  {alert.listing.year} {alert.listing.make} {alert.listing.model}
                </Link>
                <p className="text-sm text-gray-500 mt-0.5">
                  Current: <span className="font-medium text-gray-700">{formatPrice(alert.listing.currentPriceUsd)}</span>
                  {alert.targetPriceUsd != null && (
                    <span className="ml-3">
                      Alert below: <span className="font-medium text-green-700">{formatPrice(alert.targetPriceUsd)}</span>
                    </span>
                  )}
                  {alert.targetPriceUsd == null && (
                    <span className="ml-3 text-ocean-600">Any price drop</span>
                  )}
                </p>
              </div>

              {alert.notified && (
                <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full shrink-0">
                  Notified
                </span>
              )}

              <button
                onClick={() => remove.mutate(alert.listingId)}
                className="text-gray-400 hover:text-red-500 transition-colors shrink-0 text-lg leading-none"
                title="Remove alert"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
