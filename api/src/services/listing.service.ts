import { Prisma } from '@prisma/client'
import type { ListingFilters, PaginatedListings, ListingSummary, ListingDetail } from '@anchordeep/shared'
import { prisma } from '../lib/prisma.js'

function buildWhere(filters: ListingFilters): Prisma.ListingWhereInput {
  const where: Prisma.ListingWhereInput = {}

  if (filters.status) where.status = filters.status
  else where.status = 'ACTIVE'

  if (filters.make) where.make = { contains: filters.make, mode: 'insensitive' }
  if (filters.model) where.model = { contains: filters.model, mode: 'insensitive' }
  if (filters.type) where.type = filters.type
  if (filters.state) where.state = filters.state.toUpperCase()
  if (filters.propulsion) where.propulsion = filters.propulsion
  if (filters.hullMaterial) where.hullMaterial = filters.hullMaterial

  if (filters.yearMin || filters.yearMax) {
    where.year = {}
    if (filters.yearMin) where.year.gte = filters.yearMin
    if (filters.yearMax) where.year.lte = filters.yearMax
  }

  if (filters.priceMin || filters.priceMax) {
    where.currentPriceUsd = {}
    if (filters.priceMin) where.currentPriceUsd.gte = filters.priceMin
    if (filters.priceMax) where.currentPriceUsd.lte = filters.priceMax
  }

  if (filters.lengthMin || filters.lengthMax) {
    where.lengthFt = {
      ...(filters.lengthMin && { gte: filters.lengthMin }),
      ...(filters.lengthMax && { lte: filters.lengthMax }),
    }
  }

  return where
}

function buildOrderBy(sort?: string): Prisma.ListingOrderByWithRelationInput {
  switch (sort) {
    case 'price_asc': return { currentPriceUsd: 'asc' }
    case 'price_desc': return { currentPriceUsd: 'desc' }
    case 'days_on_market': return { firstSeenAt: 'asc' }
    case 'price_drop': return { updatedAt: 'desc' }
    case 'newest':
    default:
      return { firstSeenAt: 'desc' }
  }
}

export async function getListings(filters: ListingFilters): Promise<PaginatedListings> {
  const page = filters.page ?? 1
  const limit = Math.min(filters.limit ?? 24, 100)
  const skip = (page - 1) * limit
  const where = buildWhere(filters)

  // For price_drop sort, we need to join with priceHistory and filter/order by recent drops
  if (filters.sort === 'price_drop') {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    const [listings, total] = await prisma.$transaction([
      prisma.$queryRaw`
        SELECT DISTINCT l.* FROM "Listing" l
        INNER JOIN "PriceSnapshot" ps ON l.id = ps."listingId"
        WHERE l.status = 'ACTIVE'
          AND ps."priceChanged" = true
          AND ps."priceChangePct" < 0
          AND ps."createdAt" >= ${thirtyDaysAgo}
          ${filters.make ? Prisma.sql`AND l.make ILIKE ${`%${filters.make}%`}` : Prisma.empty}
          ${filters.model ? Prisma.sql`AND l.model ILIKE ${`%${filters.model}%`}` : Prisma.empty}
          ${filters.type ? Prisma.sql`AND l.type = ${filters.type}` : Prisma.empty}
          ${filters.state ? Prisma.sql`AND l.state = ${filters.state.toUpperCase()}` : Prisma.empty}
          ${filters.propulsion ? Prisma.sql`AND l.propulsion = ${filters.propulsion}` : Prisma.empty}
        ORDER BY ps."createdAt" DESC
        LIMIT ${limit}
        OFFSET ${skip}
      `,
      prisma.$queryRaw`
        SELECT COUNT(DISTINCT l.id) as count FROM "Listing" l
        INNER JOIN "PriceSnapshot" ps ON l.id = ps."listingId"
        WHERE l.status = 'ACTIVE'
          AND ps."priceChanged" = true
          AND ps."priceChangePct" < 0
          AND ps."createdAt" >= ${thirtyDaysAgo}
          ${filters.make ? Prisma.sql`AND l.make ILIKE ${`%${filters.make}%`}` : Prisma.empty}
          ${filters.model ? Prisma.sql`AND l.model ILIKE ${`%${filters.model}%`}` : Prisma.empty}
          ${filters.type ? Prisma.sql`AND l.type = ${filters.type}` : Prisma.empty}
          ${filters.state ? Prisma.sql`AND l.state = ${filters.state.toUpperCase()}` : Prisma.empty}
          ${filters.propulsion ? Prisma.sql`AND l.propulsion = ${filters.propulsion}` : Prisma.empty}
      `,
    ])

    const listingCount = (total as any[])?.[0]?.count ?? 0
    return {
      listings: (listings as any[]).map((l) => toSummaryRaw(l)),
      total: Number(listingCount),
      page,
      limit,
      totalPages: Math.ceil(Number(listingCount) / limit),
    }
  }

  const orderBy = buildOrderBy(filters.sort)
  const [listings, total] = await prisma.$transaction([
    prisma.listing.findMany({
      where,
      orderBy,
      skip,
      take: limit,
      include: {
        images: { where: { isThumbnail: true }, take: 1 },
        _count: { select: { sources: { where: { isActive: true } } } },
        priceHistory: {
          where: { priceChanged: true, createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } },
          orderBy: { createdAt: 'asc' },
          take: 1,
        },
      },
    }),
    prisma.listing.count({ where }),
  ])

  return {
    listings: listings.map((l) => toSummary(l)),
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  }
}

export async function getListingById(id: string): Promise<ListingDetail | null> {
  const listing = await prisma.listing.findUnique({
    where: { id },
    include: {
      sources: { orderBy: { createdAt: 'asc' } },
      images: { orderBy: { sortOrder: 'asc' } },
      specs: { include: { specKey: true }, orderBy: { specKey: { sortOrder: 'asc' } } },
      priceHistory: { orderBy: { createdAt: 'desc' }, take: 5 },
    },
  })

  if (!listing) return null
  return toDetail(listing)
}

export async function getListingPriceHistory(id: string) {
  return prisma.priceSnapshot.findMany({
    where: { listingId: id },
    orderBy: { createdAt: 'asc' },
  })
}

export async function getSimilarListings(id: string): Promise<ListingSummary[]> {
  const listing = await prisma.listing.findUnique({ where: { id } })
  if (!listing || !listing.fingerprintHash) return []

  const similar = await prisma.listing.findMany({
    where: {
      fingerprintHash: listing.fingerprintHash,
      id: { not: id },
      status: 'ACTIVE',
    },
    take: 6,
    include: {
      images: { where: { isThumbnail: true }, take: 1 },
      _count: { select: { sources: { where: { isActive: true } } } },
      priceHistory: {
        where: { priceChanged: true, createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } },
        orderBy: { createdAt: 'asc' },
        take: 1,
      },
    },
  })

  return similar.map(toSummary)
}

export async function getSearchSuggestions(q: string) {
  const term = q.trim().toLowerCase()
  if (!term || term.length < 2) return { makes: [], models: [] }

  const [makes, models] = await Promise.all([
    prisma.listing.findMany({
      where: { make: { contains: term, mode: 'insensitive' }, status: 'ACTIVE' },
      select: { make: true },
      distinct: ['make'],
      take: 8,
    }),
    prisma.listing.findMany({
      where: { model: { contains: term, mode: 'insensitive' }, status: 'ACTIVE' },
      select: { model: true },
      distinct: ['model'],
      take: 8,
    }),
  ])

  return {
    makes: makes.map((m) => m.make).filter(Boolean),
    models: models.map((m) => m.model).filter(Boolean),
  }
}

// ─── Mappers ───────────────────────────────────────────────────────────────

function toSummaryRaw(l: Record<string, any>): ListingSummary {
  return {
    id: l.id,
    make: l.make,
    model: l.model,
    year: l.year,
    type: l.type,
    lengthFt: l.lengthFt ? Number(l.lengthFt) : null,
    currentPriceUsd: l.currentPriceUsd,
    city: l.city,
    state: l.state,
    status: l.status,
    firstSeenAt: l.firstSeenAt.toISOString(),
    lastSeenAt: l.lastSeenAt.toISOString(),
    soldAt: l.soldAt?.toISOString() ?? null,
    thumbnailUrl: null,
    sourceCount: 0,
    priceDrop30dPct: null,
  }
}

export function toSummary(l: any): ListingSummary {
  const firstDrop = l.priceHistory?.[0]
  return {
    id: l.id,
    make: l.make,
    model: l.model,
    year: l.year,
    type: l.type,
    lengthFt: l.lengthFt ? Number(l.lengthFt) : null,
    currentPriceUsd: l.currentPriceUsd,
    city: l.city,
    state: l.state,
    status: l.status,
    firstSeenAt: l.firstSeenAt.toISOString(),
    lastSeenAt: l.lastSeenAt.toISOString(),
    soldAt: l.soldAt?.toISOString() ?? null,
    thumbnailUrl: l.images?.[0]?.url ?? null,
    sourceCount: l._count?.sources ?? 0,
    priceDrop30dPct: firstDrop?.priceChangePct ? Number(firstDrop.priceChangePct) : null,
  }
}

function toDetail(l: any): ListingDetail {
  return {
    ...toSummary({ ...l, _count: { sources: l.sources.filter((s: any) => s.isActive).length } }),
    hullMaterial: l.hullMaterial,
    propulsion: l.propulsion,
    engineHours: l.engineHours,
    lat: l.lat ? Number(l.lat) : null,
    lng: l.lng ? Number(l.lng) : null,
    soldPriceUsd: l.soldPriceUsd,
    fingerprintHash: l.fingerprintHash,
    description: l.description ?? null,
    specs: l.specs.map((s: any) => ({
      key: s.specKey.key,
      label: s.specKey.label,
      unit: s.specKey.unit,
      value: s.valueText,
      valueNumber: s.valueNumber ? Number(s.valueNumber) : null,
    })),
    sources: l.sources.map((s: any) => ({
      id: s.id,
      site: s.site,
      sourceUrl: s.sourceUrl,
      lastScrapedAt: s.lastScrapedAt?.toISOString() ?? null,
      isActive: s.isActive,
    })),
    recentSnapshots: l.priceHistory.map((p: any) => ({
      id: p.id,
      createdAt: p.createdAt.toISOString(),
      priceUsd: p.priceUsd,
      status: p.status,
      priceChanged: p.priceChanged,
      priceChangePct: p.priceChangePct ? Number(p.priceChangePct) : null,
      prevPriceUsd: p.prevPriceUsd,
      rawPriceStr: p.rawPriceStr,
    })),
    images: l.images.map((i: any) => ({
      url: i.url,
      isThumbnail: i.isThumbnail,
      sortOrder: i.sortOrder,
    })),
  }
}
