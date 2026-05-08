import { Worker, type Job } from 'bullmq'
import type { SearchJob, DetailJob } from '../lib/queue.js'
import { detailQueue, QUEUE_SEARCH, connection, enqueueNextSearchPage, MAX_SEARCH_PAGES } from '../lib/queue.js'
import { updateScrapeRun, checkSources } from '../lib/api-client.js'
import type { BaseScraper } from '../scrapers/base.scraper.js'

export function createSearchWorker(scrapers: Map<string, BaseScraper>): Worker<SearchJob> {
  return new Worker<SearchJob>(
    QUEUE_SEARCH,
    async (job: Job<SearchJob>) => {
      const { site, page, scrapeRunId } = job.data
      const scraper = scrapers.get(site)
      if (!scraper) {
        const registered = Array.from(scrapers.keys()).join(', ') || '(none)'
        throw new Error(`No scraper registered for site: ${site} (registered: ${registered})`)
      }

      job.log(`[${site}] Fetching search page ${page}...`)

      let urls: string[]
      try {
        urls = await scraper.fetchListingUrls(page)
      } catch (err) {
        if (scrapeRunId) {
          updateScrapeRun(scrapeRunId, { errors: 1 }).catch(() => null)
        }
        throw new Error(`[${site}] fetchListingUrls page ${page} failed: ${(err as Error).message}`)
      }

      job.log(`[${site}] Found ${urls.length} listing URLs on page ${page}`)

      if (!urls.length) {
        job.log(`[${site}] No URLs on page ${page} — stopping pagination`)
        return { site, page, found: 0, queued: 0, stopped: true }
      }

      // Build source refs for staleness check
      const sourceRefs = urls.map(url => ({
        site,
        externalId: scraper.extractExternalId(url),
      }))

      // Check which are fresh vs stale/new
      let freshIds = new Set<string>()
      try {
        const { fresh } = await checkSources(sourceRefs)
        freshIds = new Set(fresh)
      } catch {
        // If API is unavailable, treat all as stale so we don't silently skip
        job.log(`[${site}] checkSources unavailable — treating all ${urls.length} as stale`)
      }

      const staleUrls = urls.filter(url => !freshIds.has(scraper.extractExternalId(url)))
      const allFresh = staleUrls.length === 0

      job.log(`[${site}] Page ${page}: ${staleUrls.length} stale/new, ${freshIds.size} fresh${allFresh ? ' — stopping' : ''}`)

      if (staleUrls.length > 0) {
        const detailJobs: { name: string; data: DetailJob }[] = staleUrls.map(url => ({
          name: `${site}:detail:${scraper.extractExternalId(url)}`,
          data: { site, url, externalId: scraper.extractExternalId(url), scrapeRunId },
        }))
        await detailQueue.addBulk(detailJobs)
        job.log(`[${site}] Enqueued ${detailJobs.length} detail jobs`)

        if (scrapeRunId) {
          updateScrapeRun(scrapeRunId, { listingsFound: staleUrls.length }).catch(() => null)
        }
      }

      // Self-chain: queue next page if we found stale listings and haven't hit the cap
      if (!allFresh && page < MAX_SEARCH_PAGES) {
        await enqueueNextSearchPage(site, page, scrapeRunId)
        job.log(`[${site}] Queued page ${page + 1}`)
      }

      return { site, page, found: urls.length, queued: staleUrls.length, stopped: allFresh }
    },
    {
      connection,
      concurrency: 2,
      lockDuration: 120_000,
      limiter: { max: 5, duration: 10_000 },
    }
  )
}
