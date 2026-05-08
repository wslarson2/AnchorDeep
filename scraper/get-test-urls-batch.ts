import 'dotenv/config'
import { PrismaClient, SourceSite } from '@prisma/client'

const prisma = new PrismaClient()

async function getTestUrls() {
  try {
    const sites = [
      SourceSite.BOAT_TRADER,
      SourceSite.YACHT_WORLD,
      SourceSite.BOATS_COM,
      SourceSite.EBAY_MOTORS,
      SourceSite.CRAIGSLIST,
    ]

    for (const site of sites) {
      const sources = await prisma.listingSource.findMany({
        where: { site, isActive: true },
        orderBy: { createdAt: 'desc' },
        take: 5,
      })

      if (sources.length > 0) {
        console.log(`\n${site}:`)
        sources.forEach((s, i) => {
          console.log(`  ${i + 1}. ${s.sourceUrl}`)
        })
      } else {
        console.log(`\n${site}: NO LISTINGS FOUND`)
      }
    }
  } catch (err) {
    console.error('Error:', err)
  } finally {
    await prisma.$disconnect()
  }
}

getTestUrls()
