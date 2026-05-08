import 'dotenv/config'
import { SourceSite } from '@anchordeep/shared'
import type { BaseScraper } from './scrapers/base.scraper.js'
import { EbayMotorsScraper } from './scrapers/ebay-motors.scraper.js'
import { BoatsComScraper } from './scrapers/boats-com.scraper.js'
import { BoatTraderScraper } from './scrapers/boattrader.scraper.js'
import { YachtWorldScraper } from './scrapers/yachtworld.scraper.js'
import { CraigslistScraper } from './scrapers/craigslist.scraper.js'
import { createSearchWorker } from './workers/search.worker.js'
import { createDetailWorker } from './workers/detail.worker.js'
import { searchQueue, scheduleRecurringJobs, triggerSearch } from './lib/queue.js'
import { browserPool } from './lib/browser-pool.js'

// ─── Register scrapers ────────────────────────────────────────────────────────

const scrapers = new Map<string, BaseScraper>()

if (process.env.EBAY_APP_ID) {
  scrapers.set(SourceSite.EBAY_MOTORS, new EbayMotorsScraper(process.env.EBAY_APP_ID))
  console.log('✓ eBay Motors scraper registered')
} else {
  console.warn('⚠ EBAY_APP_ID not set — eBay Motors scraper disabled')
}

scrapers.set(SourceSite.BOATS_COM, new BoatsComScraper())
console.log('✓ boats.com scraper registered')

scrapers.set(SourceSite.BOAT_TRADER, new BoatTraderScraper())
console.log('✓ Boat Trader scraper registered')

scrapers.set(SourceSite.YACHT_WORLD, new YachtWorldScraper())
console.log('✓ YachtWorld scraper registered')

scrapers.set(SourceSite.CRAIGSLIST, new CraigslistScraper())
console.log('✓ Craigslist scraper registered')

const enabledSites = Array.from(scrapers.keys()) as SourceSite[]

// ─── Schedule recurring jobs ──────────────────────────────────────────────────
// Do this before creating workers so no jobs are processed during setup.

// Drain any stale delayed search jobs from previous runs (repeatable instances
// that were scheduled before this restart).
const delayedJobs = await searchQueue.getDelayed()
for (const job of delayedJobs) {
  await job.remove().catch(() => null)
}
if (delayedJobs.length) {
  console.log(`Cleaned ${delayedJobs.length} stale delayed search job(s) from previous run`)
}

await scheduleRecurringJobs(enabledSites)

// ─── Trigger an immediate run on startup ─────────────────────────────────────

const IMMEDIATE = process.env.SCRAPE_ON_STARTUP !== 'false'
if (IMMEDIATE) {
  for (const site of enabledSites) {
    await triggerSearch(site)
  }
}

// ─── Create workers AFTER all jobs are queued ─────────────────────────────────
// Creating workers last means they start processing with a fully-populated
// scrapers map and no pause/resume race condition.

const searchWorker = createSearchWorker(scrapers)
const detailWorker = createDetailWorker(scrapers)

searchWorker.on('completed', (_job, result) => {
  console.log(`[search] ${result.site} p${result.page} → ${result.found} found, ${result.queued} queued${result.stopped ? ' (stopped — all fresh)' : ''}`)
})
searchWorker.on('failed', (_job, err) => {
  console.error(`[search] job failed: ${err.message}`)
})

detailWorker.on('completed', (_job, result) => {
  if (result.created || result.priceChanges) {
    console.log(`[detail] ${result.site} ${result.url} — new:${result.created} changes:${result.priceChanges}`)
  }
})
detailWorker.on('failed', (_job, err) => {
  console.error(`[detail] job failed: ${err.message}`)
})

console.log(`\nAnchorDeep scraper running — ${enabledSites.length} source(s) active`)
console.log('Workers: search (concurrency=2), detail (concurrency=5)')
console.log('Bull Board: http://localhost:3030\n')

// ─── Graceful shutdown ────────────────────────────────────────────────────────

async function shutdown() {
  console.log('Shutting down scrapers...')
  await Promise.all([searchWorker.close(), detailWorker.close()])
  await browserPool.close()
  process.exit(0)
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
