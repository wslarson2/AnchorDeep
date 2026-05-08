import 'dotenv/config'
import { PrismaClient, SourceSite } from '@prisma/client'

const prisma = new PrismaClient()

async function getTestUrls() {
  try {
    const sites = [
      SourceSite.BOAT_TRADER,
      SourceSite.YACHT_WORLD,
      SourceSite.EBAY_MOTORS,
    ]

    for (const site of sites) {
      const source = await prisma.listingSource.findFirst({
        where: { site, isActive: true },
        orderBy: { createdAt: 'desc' },
      })

      if (source) {
        console.log(`${site}: ${source.sourceUrl}`)
      } else {
        console.log(`${site}: NO LISTINGS FOUND`)
      }
    }
  } catch (err) {
    console.error('Error:', err)
  } finally {
    await prisma.$disconnect()
  }
}

getTestUrls()
