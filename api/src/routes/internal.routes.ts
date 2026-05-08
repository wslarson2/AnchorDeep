import type { FastifyInstance } from 'fastify'
import { ingestListings, checkSources } from '../services/snapshot.service.js'
import { prisma } from '../lib/prisma.js'
import type { NormalizedListing } from '@anchordeep/shared'

export default async function internalRoutes(fastify: FastifyInstance) {
  fastify.post(
    '/internal/snapshots',
    { preHandler: [fastify.authenticateInternal] },
    async (request, reply) => {
      const body = request.body as { listings: NormalizedListing[] }

      if (!Array.isArray(body?.listings)) {
        return reply.code(400).send({ error: 'Body must have listings array' })
      }

      if (body.listings.length > 500) {
        return reply.code(400).send({ error: 'Max 500 listings per batch' })
      }

      const result = await ingestListings(body.listings)
      return result
    }
  )

  // Check which sources are fresh vs stale
  fastify.post(
    '/internal/check-sources',
    { preHandler: [(fastify as any).authenticateInternal] },
    async (request, reply) => {
      const { sources, freshWithinHours } = request.body as {
        sources: { site: string; externalId: string }[]
        freshWithinHours?: number
      }
      if (!Array.isArray(sources)) {
        return reply.code(400).send({ error: 'sources must be an array' })
      }
      return checkSources(sources, freshWithinHours)
    }
  )

  // Create a ScrapeRun audit record
  fastify.post(
    '/internal/scrape-runs',
    { preHandler: [(fastify as any).authenticateInternal] },
    async (request, reply) => {
      const { site } = request.body as { site: string }
      if (!site) return reply.code(400).send({ error: 'site required' })
      const run = await prisma.scrapeRun.create({ data: { site: site as any } })
      return { id: run.id }
    }
  )

  // Update a ScrapeRun with accumulated counts
  fastify.patch(
    '/internal/scrape-runs/:id',
    { preHandler: [(fastify as any).authenticateInternal] },
    async (request, reply) => {
      const { id } = request.params as { id: string }
      const body = request.body as {
        listingsFound?: number
        listingsNew?: number
        priceChanges?: number
        soldDetected?: number
        errors?: number
        errorLog?: any
        completed?: boolean
      }

      const run = await prisma.scrapeRun.update({
        where: { id },
        data: {
          ...(body.listingsFound != null && { listingsFound: { increment: body.listingsFound } }),
          ...(body.listingsNew != null && { listingsNew: { increment: body.listingsNew } }),
          ...(body.priceChanges != null && { priceChanges: { increment: body.priceChanges } }),
          ...(body.soldDetected != null && { soldDetected: { increment: body.soldDetected } }),
          ...(body.errors != null && { errors: { increment: body.errors } }),
          ...(body.errorLog != null && { errorLog: body.errorLog }),
          ...(body.completed && { completedAt: new Date() }),
        },
      })
      return { id: run.id }
    }
  )
}
