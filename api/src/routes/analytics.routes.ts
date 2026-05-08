import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { getMarketSummary, getPriceTrend } from '../services/analytics.service.js'

const marketSummarySchema = z.object({
  make: z.string().optional(),
  model: z.string().optional(),
  state: z.string().max(2).optional(),
})

const priceTrendSchema = z.object({
  make: z.string().optional(),
  model: z.string().optional(),
  yearMin: z.coerce.number().int().optional(),
  yearMax: z.coerce.number().int().optional(),
  interval: z.enum(['week', 'month']).optional(),
})

export default async function analyticsRoutes(fastify: FastifyInstance) {
  fastify.get('/analytics/market-summary', async (request, reply) => {
    const parsed = marketSummarySchema.safeParse(request.query)
    if (!parsed.success) return reply.code(400).send({ error: 'Invalid parameters' })
    const result = await getMarketSummary(parsed.data.make, parsed.data.model, parsed.data.state)
    if (!result) return reply.code(404).send({ error: 'No data found' })
    return result
  })

  fastify.get('/analytics/price-trend', async (request, reply) => {
    const parsed = priceTrendSchema.safeParse(request.query)
    if (!parsed.success) return reply.code(400).send({ error: 'Invalid parameters' })
    return getPriceTrend(
      parsed.data.make,
      parsed.data.model,
      parsed.data.yearMin,
      parsed.data.yearMax,
      parsed.data.interval
    )
  })
}
