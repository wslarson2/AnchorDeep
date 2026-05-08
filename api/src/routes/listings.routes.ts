import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import type { ListingFilters } from '@anchordeep/shared'
import { BoatType, HullMaterial, ListingStatus, PropulsionType } from '@anchordeep/shared'
import {
  getListings,
  getListingById,
  getListingPriceHistory,
  getSimilarListings,
  getSearchSuggestions,
} from '../services/listing.service.js'

const listingsQuerySchema = z.object({
  make: z.string().optional(),
  model: z.string().optional(),
  type: z.nativeEnum(BoatType).optional(),
  yearMin: z.coerce.number().int().optional(),
  yearMax: z.coerce.number().int().optional(),
  priceMin: z.coerce.number().int().optional(),
  priceMax: z.coerce.number().int().optional(),
  lengthMin: z.coerce.number().optional(),
  lengthMax: z.coerce.number().optional(),
  state: z.string().max(2).optional(),
  propulsion: z.nativeEnum(PropulsionType).optional(),
  hullMaterial: z.nativeEnum(HullMaterial).optional(),
  status: z.nativeEnum(ListingStatus).optional(),
  sort: z.enum(['price_asc', 'price_desc', 'newest', 'price_drop', 'days_on_market']).optional(),
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
})

export default async function listingsRoutes(fastify: FastifyInstance) {
  fastify.get('/listings', async (request, reply) => {
    const parsed = listingsQuerySchema.safeParse(request.query)
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Invalid query parameters', details: parsed.error.flatten() })
    }
    return getListings(parsed.data as ListingFilters)
  })

  fastify.get<{ Params: { id: string } }>('/listings/:id', async (request, reply) => {
    const listing = await getListingById(request.params.id)
    if (!listing) return reply.code(404).send({ error: 'Listing not found' })
    return listing
  })

  fastify.get<{ Params: { id: string } }>('/listings/:id/price-history', async (request, reply) => {
    const history = await getListingPriceHistory(request.params.id)
    return history.map((p) => ({
      id: p.id,
      createdAt: p.createdAt.toISOString(),
      priceUsd: p.priceUsd,
      status: p.status,
      priceChanged: p.priceChanged,
      priceChangePct: p.priceChangePct ? Number(p.priceChangePct) : null,
      prevPriceUsd: p.prevPriceUsd,
      rawPriceStr: p.rawPriceStr,
    }))
  })

  fastify.get<{ Params: { id: string } }>('/listings/:id/similar', async (request, reply) => {
    return getSimilarListings(request.params.id)
  })

  fastify.get<{ Querystring: { q?: string } }>('/search/suggestions', async (request) => {
    return getSearchSuggestions(request.query.q ?? '')
  })
}
