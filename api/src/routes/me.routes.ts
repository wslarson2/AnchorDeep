import type { FastifyInstance, FastifyRequest } from 'fastify'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { toSummary } from '../services/listing.service.js'

const IS_DEV = process.env.NODE_ENV !== 'production'
const DEV_AUTH0_ID = 'dev|local'
const DEV_EMAIL = 'dev@anchordeep.local'

const SaveListingSchema = z.object({ listingId: z.string().min(1) })
const CreateAlertSchema = z.object({
  listingId: z.string().min(1),
  targetPriceUsd: z.number().positive().optional(),
})

/** Extract Auth0 sub from verified JWT, or return dev ID in non-prod */
function getAuth0Id(request: FastifyRequest): string {
  const user = request.user
  return user?.sub ?? (IS_DEV ? DEV_AUTH0_ID : null)
}

/** Get or create a User record from Auth0 sub */
async function resolveUser(auth0Id: string, email?: string) {
  return prisma.user.upsert({
    where: { auth0Id },
    update: {},
    create: { auth0Id, email: email ?? auth0Id },
  })
}

export default async function meRoutes(fastify: FastifyInstance) {
  // All /me routes require auth
  fastify.addHook('preHandler', fastify.authenticate)

  // ─── Saved Listings ───────────────────────────────────────────────────────

  fastify.get('/me/saved-listings', async (request) => {
    const auth0Id = getAuth0Id(request)
    const user = await resolveUser(auth0Id)

    const saved = await prisma.savedListing.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      include: {
        listing: {
          include: {
            images: { where: { isThumbnail: true }, take: 1 },
            _count: { select: { sources: { where: { isActive: true } } } },
            priceHistory: {
              where: { priceChanged: true },
              orderBy: { createdAt: 'desc' },
              take: 1,
            },
          },
        },
      },
    })

    return saved.map((s) => ({
      id: s.id,
      listingId: s.listingId,
      createdAt: s.createdAt.toISOString(),
      listing: toSummary(s.listing),
    }))
  })

  fastify.post('/me/saved-listings', async (request, reply) => {
    const parseResult = SaveListingSchema.safeParse(request.body)
    if (!parseResult.success) return reply.code(400).send({ error: 'Invalid request body', details: parseResult.error.errors })
    const { listingId } = parseResult.data

    const auth0Id = getAuth0Id(request)
    const user = await resolveUser(auth0Id)

    const listing = await prisma.listing.findUnique({ where: { id: listingId } })
    if (!listing) return reply.code(404).send({ error: 'Listing not found' })

    const saved = await prisma.savedListing.upsert({
      where: { userId_listingId: { userId: user.id, listingId } },
      update: {},
      create: { userId: user.id, listingId },
    })

    return reply.code(201).send({ id: saved.id, listingId: saved.listingId, createdAt: saved.createdAt.toISOString() })
  })

  fastify.delete('/me/saved-listings/:listingId', async (request, reply) => {
    const { listingId } = request.params as { listingId: string }
    const auth0Id = getAuth0Id(request)
    const user = await resolveUser(auth0Id)

    await prisma.savedListing.deleteMany({
      where: { userId: user.id, listingId },
    })

    return reply.code(204).send()
  })

  // ─── Price Alerts ─────────────────────────────────────────────────────────

  fastify.get('/me/alerts', async (request) => {
    const auth0Id = getAuth0Id(request)
    const user = await resolveUser(auth0Id)

    const alerts = await prisma.priceAlert.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      include: {
        listing: {
          include: { images: { where: { isThumbnail: true }, take: 1 } },
        },
      },
    })

    return alerts.map((a) => ({
      id: a.id,
      listingId: a.listingId,
      targetPriceUsd: a.targetPriceUsd,
      notified: a.notified,
      createdAt: a.createdAt.toISOString(),
      listing: {
        id: a.listing.id,
        make: a.listing.make,
        model: a.listing.model,
        year: a.listing.year,
        currentPriceUsd: a.listing.currentPriceUsd,
        thumbnailUrl: a.listing.images?.[0]?.url ?? null,
      },
    }))
  })

  fastify.post('/me/alerts', async (request, reply) => {
    const parseResult = CreateAlertSchema.safeParse(request.body)
    if (!parseResult.success) return reply.code(400).send({ error: 'Invalid request body', details: parseResult.error.errors })
    const { listingId, targetPriceUsd } = parseResult.data

    const auth0Id = getAuth0Id(request)
    const user = await resolveUser(auth0Id)

    const listing = await prisma.listing.findUnique({ where: { id: listingId } })
    if (!listing) return reply.code(404).send({ error: 'Listing not found' })

    const alert = await prisma.priceAlert.upsert({
      where: { userId_listingId: { userId: user.id, listingId } },
      update: { targetPriceUsd: targetPriceUsd ?? null, notified: false },
      create: { userId: user.id, listingId, targetPriceUsd: targetPriceUsd ?? null },
    })

    return reply.code(201).send({
      id: alert.id,
      listingId: alert.listingId,
      targetPriceUsd: alert.targetPriceUsd,
      notified: alert.notified,
      createdAt: alert.createdAt.toISOString(),
    })
  })

  fastify.delete('/me/alerts/:listingId', async (request, reply) => {
    const { listingId } = request.params as { listingId: string }
    const auth0Id = getAuth0Id(request)
    const user = await resolveUser(auth0Id)

    await prisma.priceAlert.deleteMany({
      where: { userId: user.id, listingId },
    })

    return reply.code(204).send()
  })
}
