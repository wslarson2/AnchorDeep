import 'dotenv/config'
import { PrismaClient, SourceSite } from '@prisma/client'

const prisma = new PrismaClient()

async function findMissingPrices() {
  console.log('🔍 Analyzing missing prices...\n')

  // Count listings by site and price status
  const sites = Object.values(SourceSite).filter(s => typeof s === 'string')

  for (const site of sites) {
    const total = await prisma.listing.count({
      where: { sources: { some: { site: site as SourceSite, isActive: true } } },
    })

    const withPrice = await prisma.listing.count({
      where: {
        currentPriceUsd: { not: null },
        sources: { some: { site: site as SourceSite, isActive: true } },
      },
    })

    const withoutPrice = total - withPrice
    const percent = total > 0 ? ((withPrice / total) * 100).toFixed(1) : 'N/A'

    if (total > 0) {
      console.log(`${site.padEnd(15)} | Total: ${total.toString().padEnd(3)} | With Price: ${withPrice.toString().padEnd(3)} (${percent}%) | Missing: ${withoutPrice}`)
    }
  }

  // Sample listings without prices
  console.log('\n📋 Sample listings without prices:')
  console.log('─'.repeat(80))

  const noPriceListings = await prisma.listing.findMany({
    where: { currentPriceUsd: null },
    include: { sources: { where: { isActive: true }, take: 1 } },
    take: 10,
  })

  for (const listing of noPriceListings) {
    const source = listing.sources[0]
    console.log(`${listing.make?.padEnd(15)} ${listing.model?.padEnd(15)} | ${source?.site.padEnd(15)} | ${source?.sourceUrl.slice(0, 50)}`)
  }

  console.log(`\n\nTotal listings without prices: ${await prisma.listing.count({ where: { currentPriceUsd: null } })}`)
  console.log('\n💡 Recommendation: Run re-scrape on these URLs to capture prices')

  await prisma.$disconnect()
}

findMissingPrices().catch(console.error)
