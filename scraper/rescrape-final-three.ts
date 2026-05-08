import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { BoatsComScraper } from './src/scrapers/boats-com.scraper.js'

const prisma = new PrismaClient()
const scraper = new BoatsComScraper()

const urls = [
  'https://www.boats.com/sailing-boats/2026-lagoon-42',
  'https://www.boats.com/sailing-boats/2026-lagoon-46',
  'https://www.boats.com/power-boats/2026-aventura-38',
]

async function rescrapeThree() {
  console.log('🔄 Re-scraping final 3 listings without prices...\n')

  for (const url of urls) {
    try {
      console.log(`Scraping ${url.split('/').pop()}... `)
      const scraped = await scraper.scrapeDetailPage(url)
      console.log(`  rawPriceStr: "${scraped.rawPriceStr}"`)
      console.log(`  price: ${scraped.price}`)
    } catch (err) {
      console.log(`  Error: ${(err as Error).message.slice(0, 80)}`)
    }
  }

  await prisma.$disconnect()
}

rescrapeThree().catch(console.error)
