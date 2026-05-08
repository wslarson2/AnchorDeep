import { prisma } from '../lib/prisma.js'

export async function getMarketSummary(make?: string, model?: string, state?: string) {
  const where: any = { status: 'ACTIVE', currentPriceUsd: { not: null } }
  if (make) where.make = { contains: make, mode: 'insensitive' }
  if (model) where.model = { contains: model, mode: 'insensitive' }
  if (state) where.state = state.toUpperCase()

  const listings = await prisma.listing.findMany({
    where,
    select: { currentPriceUsd: true, firstSeenAt: true },
  })

  if (!listings.length) return null

  const prices = listings.map((l) => l.currentPriceUsd!).sort((a, b) => a - b)
  const avg = Math.round(prices.reduce((s, p) => s + p, 0) / prices.length)
  const median = prices[Math.floor(prices.length / 2)]!
  const now = Date.now()
  const avgDaysOnMarket = Math.round(
    listings.reduce((s, l) => s + (now - l.firstSeenAt.getTime()) / 86400000, 0) / listings.length
  )

  // Count listings that had a price drop in last 30 days
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
  const priceDropCount = await prisma.priceSnapshot.count({
    where: {
      listing: where,
      priceChanged: true,
      priceChangePct: { lt: 0 },
      createdAt: { gte: thirtyDaysAgo },
    },
  })

  return {
    totalActive: listings.length,
    avgPriceUsd: avg,
    medianPriceUsd: median,
    avgDaysOnMarket,
    priceDropCount30d: priceDropCount,
  }
}

export async function getPriceTrend(
  make?: string,
  model?: string,
  yearMin?: number,
  yearMax?: number,
  interval: 'week' | 'month' = 'month'
) {
  const truncFn = interval === 'week' ? 'week' : 'month'

  // Use raw SQL for time-series aggregation — cleaner than Prisma query builder
  const results = await prisma.$queryRaw<{ period: Date; avg_price: number; count: number }[]>`
    SELECT
      DATE_TRUNC(${truncFn}, ps."createdAt") AS period,
      ROUND(AVG(ps."priceUsd"))::int         AS avg_price,
      COUNT(*)::int                           AS count
    FROM "PriceSnapshot" ps
    JOIN "Listing" l ON l.id = ps."listingId"
    WHERE ps."priceUsd" > 0
      ${make ? prisma.$queryRaw`AND LOWER(l.make) LIKE LOWER(${'%' + make + '%'})` : prisma.$queryRaw``}
      ${model ? prisma.$queryRaw`AND LOWER(l.model) LIKE LOWER(${'%' + model + '%'})` : prisma.$queryRaw``}
      ${yearMin ? prisma.$queryRaw`AND l.year >= ${yearMin}` : prisma.$queryRaw``}
      ${yearMax ? prisma.$queryRaw`AND l.year <= ${yearMax}` : prisma.$queryRaw``}
    GROUP BY period
    ORDER BY period ASC
  `

  return results.map((r) => ({
    date: r.period.toISOString(),
    avgPriceUsd: r.avg_price,
    count: r.count,
  }))
}
