import 'dotenv/config'
import { SourceSite } from '@anchordeep/shared'
import type { BaseScraper } from './src/scrapers/base.scraper.js'
import { BoatsComScraper } from './src/scrapers/boats-com.scraper.js'
import { YachtWorldScraper } from './src/scrapers/yachtworld.scraper.js'
import { CraigslistScraper } from './src/scrapers/craigslist.scraper.js'

const scrapers = new Map<SourceSite, BaseScraper>([
  [SourceSite.YACHT_WORLD, new YachtWorldScraper()],
  [SourceSite.BOATS_COM, new BoatsComScraper()],
  [SourceSite.CRAIGSLIST, new CraigslistScraper()],
])

const testUrls = {
  [SourceSite.YACHT_WORLD]: [
    'https://www.yachtworld.com/yacht/2026-bali-4-2-10026650/',
    'https://www.yachtworld.com/yacht/2024-leopard-45-9609207/',
    'https://www.yachtworld.com/yacht/2007-leopard-46-10156187/',
    'https://www.yachtworld.com/yacht/2004-lagoon-380-9838667/',
    'https://www.yachtworld.com/yacht/2002-leopard-42-10102579/',
  ],
  [SourceSite.BOATS_COM]: [
    'https://www.boats.com/sailing-boats/2026-nautitech-40-open-10050253/',
    'https://www.boats.com/sailing-boats/2026-nautitech-44-open-10050257/',
    'https://www.boats.com/sailing-boats/2026-fountaine-pajot-fp44-catamaran-10106976/',
    'https://www.boats.com/sailing-boats/2026-nautitech-44-open-10050260/',
    'https://www.boats.com/sailing-boats/2026-nautitech-41-type-s-10050256/',
  ],
  [SourceSite.CRAIGSLIST]: [
    'https://miami.craigslist.org/mdc/boa/d/miami-2015-leopard-48-sailing-catamaran/7931764725.html',
    'https://jacksonville.craigslist.org/boa/d/penney-farms-1994-lagoon-42-tpi/7917797819.html',
    'https://miami.craigslist.org/brw/boa/d/fort-lauderdale-2023-leopard-50-sailing/7930458111.html',
    'https://jacksonville.craigslist.org/boa/d/fort-lauderdale-leopard-power-catamaran/7925925830.html',
  ],
}

interface Result {
  url: string
  make: string | null
  model: string | null
  year: number | null
  price: string | null
  length: number | null
  type: string | null
  description: string | null
  images: number
  error: string | null
}

async function testBatch() {
  const results: Map<SourceSite, Result[]> = new Map()

  for (const [site, urls] of Object.entries(testUrls)) {
    const siteEnum = site as SourceSite
    const scraper = scrapers.get(siteEnum)
    if (!scraper) continue

    console.log(`\n🔄 Testing ${siteEnum}...`)
    const siteResults: Result[] = []

    for (let i = 0; i < urls.length; i++) {
      const url = urls[i]
      try {
        const data = await scraper.scrapeDetailPage(url)
        siteResults.push({
          url: url.split('/').pop() || url,
          make: data.make,
          model: data.model,
          year: data.year,
          price: data.rawPriceStr,
          length: data.lengthFt,
          type: data.type,
          description: data.description ? 'YES' : 'NO',
          images: data.imageUrls.length,
          error: null,
        })
        process.stdout.write('.')
      } catch (err) {
        siteResults.push({
          url: url.split('/').pop() || url,
          make: null,
          model: null,
          year: null,
          price: null,
          length: null,
          type: null,
          description: null,
          images: 0,
          error: (err as Error).message,
        })
        process.stdout.write('E')
      }
    }

    results.set(siteEnum, siteResults)
    console.log()
  }

  // Print results
  console.log('\n\n📊 RESULTS:\n')

  for (const [site, siteResults] of results) {
    console.log(`\n${site}:`)
    console.log('─'.repeat(150))

    // Header
    console.log(
      [
        'URL'.padEnd(20),
        'Make'.padEnd(15),
        'Model'.padEnd(12),
        'Year'.padEnd(6),
        'Price'.padEnd(15),
        'Length'.padEnd(10),
        'Type'.padEnd(12),
        'Desc'.padEnd(6),
        'Images'.padEnd(8),
        'Error'.padEnd(30),
      ].join('│'),
    )
    console.log('─'.repeat(150))

    for (const r of siteResults) {
      console.log(
        [
          r.url.slice(0, 19).padEnd(20),
          (r.make || '—').slice(0, 14).padEnd(15),
          (r.model || '—').slice(0, 11).padEnd(12),
          (r.year || '—').toString().padEnd(6),
          (r.price || '—').slice(0, 14).padEnd(15),
          (r.length ? r.length.toString() : '—').padEnd(10),
          (r.type || '—').slice(0, 11).padEnd(12),
          (r.description || '—').padEnd(6),
          r.images.toString().padEnd(8),
          (r.error || '—').slice(0, 29).padEnd(30),
        ].join('│'),
      )
    }

    // Summary
    const complete = siteResults.filter(r => r.make && r.year && r.price).length
    const withDesc = siteResults.filter(r => r.description === 'YES').length
    console.log(`\nSummary: ${complete}/${siteResults.length} complete | ${withDesc}/${siteResults.length} with description`)
  }
}

testBatch().catch(console.error)
