import crypto from 'crypto'
import type { NormalizedListing, IngestResult } from '@anchordeep/shared'
import { prisma } from '../lib/prisma.js'

export interface SourceRef { site: string; externalId: string }
export interface CheckSourcesResult { fresh: string[]; stale: string[] }

export async function checkSources(
  sources: SourceRef[],
  freshWithinHours = 6
): Promise<CheckSourcesResult> {
  if (!sources.length) return { fresh: [], stale: [] }

  const cutoff = new Date(Date.now() - freshWithinHours * 60 * 60 * 1000)

  const found = await prisma.listingSource.findMany({
    where: {
      OR: sources.map(s => ({ site: s.site as any, externalId: s.externalId })),
    },
    select: { externalId: true, lastScrapedAt: true },
  })

  const foundMap = new Map(found.map(r => [r.externalId, r.lastScrapedAt]))
  const fresh: string[] = []
  const stale: string[] = []

  for (const { externalId } of sources) {
    const lastScraped = foundMap.get(externalId)
    if (lastScraped && lastScraped > cutoff) {
      fresh.push(externalId)
    } else {
      stale.push(externalId)
    }
  }

  return { fresh, stale }
}

function computeFingerprint(l: NormalizedListing): string {
  const parts = [
    (l.make ?? '').toLowerCase().trim(),
    (l.model ?? '').toLowerCase().trim(),
    String(l.year ?? ''),
    String(l.lengthFt != null ? Math.floor(l.lengthFt) : ''),
    (l.state ?? '').toLowerCase().trim(),
  ]
  return crypto.createHash('sha256').update(parts.join('|')).digest('hex')
}

function parsePriceCents(raw: string | null): number | null {
  if (!raw) return null
  const digits = raw.replace(/[^0-9]/g, '')
  if (!digits) return null
  return parseInt(digits, 10) * 100  // assume dollars, convert to cents
}

export async function ingestListings(listings: NormalizedListing[]): Promise<IngestResult> {
  const result: IngestResult = { created: 0, updated: 0, priceChanges: 0, soldDetected: 0, errors: 0, errorDetails: [] }

  for (const raw of listings) {
    try {
      await ingestOne(raw, result)
    } catch (err) {
      result.errors++
      result.errorDetails.push(`${raw.site}:${raw.externalId} — ${(err as Error).message}`)
    }
  }

  return result
}

async function ingestOne(normalized: NormalizedListing, result: IngestResult) {
  const priceUsd = normalized.priceUsd ?? parsePriceCents(normalized.rawPriceStr)
  const fingerprint = computeFingerprint(normalized)

  await prisma.$transaction(async (tx) => {
    // 1. Upsert the ListingSource record
    let source = await tx.listingSource.findUnique({
      where: { site_externalId: { site: normalized.site, externalId: normalized.externalId } },
      include: { listing: true },
    })

    let listing: any
    let isNew = false

    if (!source) {
      // Try cross-site deduplication via fingerprint
      const existingListing = await tx.listing.findFirst({
        where: { fingerprintHash: fingerprint },
        orderBy: { firstSeenAt: 'asc' },
      })

      if (existingListing) {
        listing = existingListing
      } else {
        // Create a new canonical listing
        listing = await tx.listing.create({
          data: {
            make: normalized.make,
            model: normalized.model,
            year: normalized.year,
            type: normalized.type,
            lengthFt: normalized.lengthFt,
            hullMaterial: normalized.hullMaterial,
            propulsion: normalized.propulsion,
            engineHours: normalized.engineHours,
            city: normalized.city,
            state: normalized.state,
            description: normalized.description,
            currentPriceUsd: priceUsd,
            status: normalized.status,
            fingerprintHash: fingerprint,
          },
        })
        isNew = true
        result.created++

        // Upsert images
        if (normalized.imageUrls.length > 0) {
          await tx.listingImage.createMany({
            data: normalized.imageUrls.map((url, i) => ({
              listingId: listing.id,
              url,
              isThumbnail: i === 0,
              sortOrder: i,
            })),
            skipDuplicates: true,
          })
        }
      }

      source = await tx.listingSource.create({
        data: {
          listingId: listing.id,
          site: normalized.site,
          externalId: normalized.externalId,
          sourceUrl: normalized.sourceUrl,
          isActive: normalized.status === 'ACTIVE',
          soldHint: normalized.status === 'SOLD',
          rawDataJson: normalized.rawJson as any,
          lastScrapedAt: new Date(),
          lastSuccessAt: new Date(),
          consecutiveFails: 0,
        },
        include: { listing: true },
      })
    } else {
      listing = source.listing

      // Update source scrape metadata
      await tx.listingSource.update({
        where: { id: source.id },
        data: {
          lastScrapedAt: new Date(),
          lastSuccessAt: new Date(),
          consecutiveFails: 0,
          isActive: normalized.status === 'ACTIVE',
          soldHint: normalized.status === 'SOLD',
          rawDataJson: normalized.rawJson as any,
        },
      })
    }

    // 2. Detect price change and write snapshot
    const prevPrice = listing.currentPriceUsd as number | null
    const priceChanged = priceUsd != null && prevPrice != null && priceUsd !== prevPrice
    let priceChangePct: number | null = null

    if (priceChanged && prevPrice) {
      priceChangePct = Math.round(((priceUsd! - prevPrice) / prevPrice) * 10000) / 100
      result.priceChanges++
    }

    if (priceUsd != null || isNew) {
      await tx.priceSnapshot.create({
        data: {
          listingId: listing.id,
          sourceId: source.id,
          priceUsd: priceUsd ?? 0,
          status: normalized.status,
          priceChanged,
          priceChangePct,
          prevPriceUsd: priceChanged ? prevPrice : null,
          rawPriceStr: normalized.rawPriceStr,
        },
      })
    }

    // 3. Update the canonical listing's denormalized fields
    const updateData: any = {
      lastSeenAt: new Date(),
      updatedAt: new Date(),
    }

    if (priceUsd != null) updateData.currentPriceUsd = priceUsd
    if (normalized.description) updateData.description = normalized.description
    if (isNew) {
      updateData.make = normalized.make
      updateData.model = normalized.model
      updateData.year = normalized.year
      updateData.type = normalized.type
    }

    // Sold detection — two-signal approach:
    // Signal A: canonical source reports sold → mark immediately
    // Signal B: all sources inactive but no explicit sold hint → EXPIRED
    if (normalized.status === 'SOLD' && source) {
      const isCanonicSource =
        !listing.canonicalSourceId || listing.canonicalSourceId === source!.id
      const allSources = await tx.listingSource.findMany({ where: { listingId: listing.id } })
      const allInactive = allSources.every((s: any) => !s.isActive || s!.id === source!.id)

      if (isCanonicSource || allInactive) {
        updateData.status = 'SOLD'
        updateData.soldAt = new Date()
        updateData.soldPriceUsd = priceUsd ?? listing.currentPriceUsd
        result.soldDetected++
      }
    } else if (normalized.status === 'ACTIVE' && listing.status !== 'ACTIVE' && listing.status !== 'SOLD') {
      // Re-listed after expiry
      updateData.status = 'ACTIVE'
    }

    await tx.listing.update({ where: { id: listing.id }, data: updateData })

    // 4. Upsert specs
    if (Object.keys(normalized.specs).length > 0) {
      for (const [key, valueText] of Object.entries(normalized.specs)) {
        let specKey = await tx.specKey.findUnique({ where: { key } })
        if (!specKey) {
          specKey = await tx.specKey.create({
            data: { key, label: key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) },
          })
        }

        const valueNumber = /^[\d.]+$/.test(valueText.trim()) ? parseFloat(valueText) : null

        await tx.listingSpec.upsert({
          where: { listingId_specKeyId: { listingId: listing.id, specKeyId: specKey.id } },
          create: { listingId: listing.id, specKeyId: specKey.id, valueText, valueNumber },
          update: { valueText, valueNumber },
        })
      }
    }

    if (!isNew) result.updated++
  })
}
