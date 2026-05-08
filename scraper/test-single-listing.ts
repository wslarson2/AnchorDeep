import 'dotenv/config'
import { SourceSite } from '@anchordeep/shared'
import type { BaseScraper } from './src/scrapers/base.scraper.js'
import { BoatTraderScraper } from './src/scrapers/boattrader.scraper.js'
import { YachtWorldScraper } from './src/scrapers/yachtworld.scraper.js'
import { BoatsComScraper } from './src/scrapers/boats-com.scraper.js'
import { CraigslistScraper } from './src/scrapers/craigslist.scraper.js'
import { EbayMotorsScraper } from './src/scrapers/ebay-motors.scraper.js'

const scrapers = new Map<SourceSite, BaseScraper>([
  [SourceSite.BOAT_TRADER, new BoatTraderScraper()],
  [SourceSite.YACHT_WORLD, new YachtWorldScraper()],
  [SourceSite.BOATS_COM, new BoatsComScraper()],
  [SourceSite.CRAIGSLIST, new CraigslistScraper()],
  [SourceSite.EBAY_MOTORS, new EbayMotorsScraper(process.env.EBAY_APP_ID || '')],
])

function detectSiteFromUrl(url: string): SourceSite | null {
  if (url.includes('boattrader.com')) return SourceSite.BOAT_TRADER
  if (url.includes('yachtworld.com')) return SourceSite.YACHT_WORLD
  if (url.includes('boats.com')) return SourceSite.BOATS_COM
  if (url.includes('craigslist.org')) return SourceSite.CRAIGSLIST
  if (url.includes('ebay.com')) return SourceSite.EBAY_MOTORS
  return null
}

async function testSingleListing() {
  const url = process.argv[2]

  if (!url) {
    console.log('Usage: tsx test-single-listing.ts <url>')
    console.log('\nExample:')
    console.log('  tsx test-single-listing.ts "https://www.boattrader.com/boats/makemodel-..."')
    process.exit(1)
  }

  try {
    const site = detectSiteFromUrl(url)
    if (!site) {
      console.log(`❌ Could not detect site from URL: ${url}`)
      console.log('Supported sites: boattrader.com, yachtworld.com, boats.com, craigslist.org, ebay.com')
      process.exit(1)
    }

    const scraper = scrapers.get(site)
    if (!scraper) {
      console.log(`❌ No scraper found for ${site}`)
      process.exit(1)
    }

    console.log(`\n🔗 URL: ${url}`)
    console.log(`🌐 Site: ${site}\n`)

    console.log('🔄 Scraping...\n')
    const result = await scraper.scrapeDetailPage(url)

    console.log('📊 SCRAPED DATA:\n')
    console.log(JSON.stringify(result, null, 2))
    console.log('\n✅ Scrape complete')
  } catch (err) {
    console.error('❌ Error:', err instanceof Error ? err.message : err)
    process.exit(1)
  }
}

testSingleListing()
