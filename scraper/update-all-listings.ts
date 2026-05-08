import 'dotenv/config'
import { PrismaClient, SourceSite } from '@prisma/client'
import type { BaseScraper } from './src/scrapers/base.scraper.js'
import { BoatTraderScraper } from './src/scrapers/boattrader.scraper.js'
import { YachtWorldScraper } from './src/scrapers/yachtworld.scraper.js'
import { BoatsComScraper } from './src/scrapers/boats-com.scraper.js'
import { CraigslistScraper } from './src/scrapers/craigslist.scraper.js'
import { EbayMotorsScraper } from './src/scrapers/ebay-motors.scraper.js'

const prisma = new PrismaClient()

const scrapers = new Map<SourceSite, BaseScraper>([
  [SourceSite.BOAT_TRADER, new BoatTraderScraper()],
  [SourceSite.YACHT_WORLD, new YachtWorldScraper()],
  [SourceSite.BOATS_COM, new BoatsComScraper()],
  [SourceSite.CRAIGSLIST, new CraigslistScraper()],
  [SourceSite.EBAY_MOTORS, new EbayMotorsScraper(process.env.EBAY_APP_ID || '')],
])

interface UpdateStats {
  processed: number
  updated: number
  errors: number
  startTime: number
}

async function updateAllListings() {
  const limit = parseInt(process.argv[2] || '0', 10) // 0 = unlimited
  const stats: UpdateStats = {
    processed: 0,
    updated: 0,
    errors: 0,
    startTime: Date.now(),
  }

  try {
    // Get total count
    const totalSources = await prisma.listingSource.count({
      where: { isActive: true },
    })

    console.log(`📋 Updating ${limit > 0 ? limit : totalSources} active listings...\n`)

    // Process in batches
    const batchSize = 10
    let skipped = 0

    while (stats.processed < (limit > 0 ? limit : totalSources)) {
      const sources = await prisma.listingSource.findMany({
        where: { isActive: true },
        orderBy: { lastScrapedAt: 'asc' },
        take: batchSize,
        skip: skipped,
        include: { listing: true },
      })

      if (sources.length === 0) break

      for (const source of sources) {
        stats.processed++

        try {
          const scraper = scrapers.get(source.site)
          if (!scraper) {
            console.log(`⚠️  [${stats.processed}] No scraper for ${source.site}`)
            stats.errors++
            continue
          }

          // Scrape the URL
          const scraped = await scraper.scrapeDetailPage(source.sourceUrl)

          // Update listing with scraped data
          await prisma.listing.update({
            where: { id: source.listingId },
            data: {
              make: scraped.make,
              model: scraped.model,
              year: scraped.year,
              type: scraped.type,
              lengthFt: scraped.lengthFt,
              hullMaterial: scraped.hullMaterial,
              propulsion: scraped.propulsion,
              engineHours: scraped.engineHours,
              city: scraped.city,
              state: scraped.state,
              description: scraped.description,
              updatedAt: new Date(),
            },
          })

          // Update listing source metadata
          await prisma.listingSource.update({
            where: { id: source.id },
            data: {
              lastScrapedAt: new Date(),
              lastSuccessAt: new Date(),
              consecutiveFails: 0,
              soldHint: scraped.isSold,
            },
          })

          // Update images if we have new ones
          if (scraped.imageUrls.length > 0) {
            // Delete old images for this listing
            await prisma.listingImage.deleteMany({
              where: { listingId: source.listingId },
            })

            // Add new images
            await prisma.listingImage.createMany({
              data: scraped.imageUrls.map((url, idx) => ({
                listingId: source.listingId,
                url,
                sortOrder: idx,
                isThumbnail: idx === 0,
              })),
            })
          }

          stats.updated++
          process.stdout.write('✓')
        } catch (err) {
          stats.errors++
          process.stdout.write('✗')
          console.error(`\n❌ Error updating ${source.sourceUrl}:`, (err as Error).message)
        }

        // Progress indicator
        if (stats.processed % 50 === 0) {
          const elapsed = ((Date.now() - stats.startTime) / 1000).toFixed(1)
          console.log(
            `\n[${stats.processed}/${limit > 0 ? limit : totalSources}] ${stats.updated} updated, ${stats.errors} errors (${elapsed}s)`,
          )
        }
      }

      skipped += batchSize
    }

    const elapsed = ((Date.now() - stats.startTime) / 1000).toFixed(1)
    console.log(`\n\n✅ Complete!`)
    console.log(`─────────────────────────────────────`)
    console.log(`Processed: ${stats.processed}`)
    console.log(`Updated:   ${stats.updated}`)
    console.log(`Errors:    ${stats.errors}`)
    console.log(`Time:      ${elapsed}s`)
    console.log(`─────────────────────────────────────`)
  } catch (err) {
    console.error('Fatal error:', err)
  } finally {
    await prisma.$disconnect()
  }
}

updateAllListings()
