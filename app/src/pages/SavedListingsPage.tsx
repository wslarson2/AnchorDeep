import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { apiClient } from '../lib/api-client.ts'
import ListingCard from '../components/listing/ListingCard.tsx'

export default function SavedListingsPage() {
  const queryClient = useQueryClient()

  const { data: saved, isLoading } = useQuery({
    queryKey: ['saved-listings'],
    queryFn: () => apiClient.getSavedListings(),
  })

  const unsave = useMutation({
    mutationFn: (listingId: string) => apiClient.unsaveListing(listingId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['saved-listings'] }),
  })

  if (isLoading) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-8 space-y-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-40 bg-gray-100 rounded-xl animate-pulse" />
        ))}
      </div>
    )
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Saved Listings</h1>
        <span className="text-sm text-gray-500">{saved?.length ?? 0} saved</span>
      </div>

      {!saved?.length ? (
        <div className="text-center py-20">
          <p className="text-gray-400 text-lg mb-4">No saved listings yet</p>
          <Link to="/" className="text-ocean-600 hover:underline text-sm">Browse boats</Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {saved.map((s) => (
            <div key={s.id} className="relative group">
              <ListingCard listing={s.listing} />
              <button
                onClick={() => unsave.mutate(s.listingId)}
                className="absolute top-2 right-2 bg-white/90 hover:bg-red-50 text-red-500 hover:text-red-700 rounded-full w-8 h-8 flex items-center justify-center text-lg shadow transition-colors opacity-0 group-hover:opacity-100"
                title="Remove from saved"
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
