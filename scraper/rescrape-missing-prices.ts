import 'dotenv/config'
import { PrismaClient, SourceSite } from '@prisma/client'
import type { BaseScraper } from './src/scrapers/base.scraper.js'
import { BoatsComScraper } from './src/scrapers/boats-com.scraper.js'

const prisma = new PrismaClient()
const scraper = new BoatsComScraper()

async function rescrapeBoatsComPrices() {
  console.log('🔄 Re-scraping Boats.com listings for prices...\n')

  // Get all boats.com listings without prices
  const noPriceSources = await prisma.listingSource.findMany({
    where: {
      site: SourceSite.BOATS_COM,
      listing: { currentPriceUsd: null },
    },
    include: { listing: true },
    take: 50, // limit to 50 for now
  })

  console.log(`Found ${noPriceSources.length} Boats.com listings without prices\n`)

  let updated = 0
  let failed = 0

  for (let i = 0; i < noPriceSources.length; i++) {
    const source = noPriceSources[i]

    try {
      process.stdout.write(`[${i + 1}/${noPriceSources.length}] Scraping ${source.sourceUrl.slice(0, 60)}... `)

      const scraped = await scraper.scrapeDetailPage(source.sourceUrl)

      if (scraped.rawPriceStr) {
        // Parse price to cents
        const priceMatch = scraped.rawPriceStr.match(/[\d,]+/)
        if (priceMatch) {
          const priceUsd = Math.round(parseFloat(priceMatch[0].replace(/,/g, '')) * 100)

          await prisma.listing.update({
            where: { id: source.listingId },
            data: { currentPriceUsd: priceUsd },
          })

          console.log(`✓ Found: ${scraped.rawPriceStr}`)
          updated++
        } else {
          console.log(`✗ No valid price parsed from: ${scraped.rawPriceStr}`)
          failed++
        }
      } else {
        console.log(`✗ No price found`)
        failed++
      }
    } catch (err) {
      console.log(`✗ Error: ${(err as Error).message.slice(0, 50)}`)
      failed++
    }
  }

  console.log(`\n✅ Complete!`)
  console.log(`Updated: ${updated}`)
  console.log(`Failed:  ${failed}`)

  await prisma.$disconnect()
}

rescrapeBoatsComPrices().catch(console.error)
