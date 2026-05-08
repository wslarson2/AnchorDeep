import 'dotenv/config'
import { PrismaClient, SourceSite } from '@prisma/client'

const prisma = new PrismaClient()
const BASE_URLS = {
  [SourceSite.BOATS_COM]: 'https://www.boats.com',
  [SourceSite.BOAT_TRADER]: 'https://www.boattrader.com',
  [SourceSite.YACHT_WORLD]: 'https://www.yachtworld.com',
}

async function fixRelativeUrls() {
  console.log('🔧 Fixing relative URLs...\n')

  for (const [site, baseUrl] of Object.entries(BASE_URLS)) {
    const sourceEnum = site as SourceSite
    const baseUrlStr = baseUrl as string

    // Find all relative URLs for this site
    const relative = await prisma.listingSource.findMany({
      where: {
        site: sourceEnum,
        sourceUrl: { not: { startsWith: 'http' } },
      },
    })

    if (relative.length === 0) {
      console.log(`${site}: ✓ No relative URLs`)
      continue
    }

    console.log(`${site}: Found ${relative.length} relative URLs, fixing...`)

    for (const source of relative) {
      const fullUrl = `${baseUrlStr}${source.sourceUrl}`
      await prisma.listingSource.update({
        where: { id: source.id },
        data: { sourceUrl: fullUrl },
      })
      process.stdout.write('.')
    }

    console.log(` ✓\n`)
  }

  console.log('\n✅ All relative URLs fixed!')
  await prisma.$disconnect()
}

fixRelativeUrls().catch(console.error)
