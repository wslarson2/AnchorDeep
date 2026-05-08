import { Worker, type Job } from 'bullmq'
import type { DetailJob } from '../lib/queue.js'
import { QUEUE_DETAIL, connection } from '../lib/queue.js'
import { updateScrapeRun } from '../lib/api-client.js'
import type { BaseScraper } from '../scrapers/base.scraper.js'
import { normalize } from '../pipeline/normalizer.js'
import { sendBatch } from '../lib/api-client.js'
import { isTargetListing } from '../config/targets.js'

export function createDetailWorker(scrapers: Map<string, BaseScraper>): Worker<DetailJob> {
  return new Worker<DetailJob>(
    QUEUE_DETAIL,
    async (job: Job<DetailJob>) => {
      const { site, url, scrapeRunId } = job.data
      const scraper = scrapers.get(site)
      if (!scraper) {
        console.warn(`[detail] Unknown site "${site}" — skipping job`)
        return { site, url, created: 0, priceChanges: 0 }
      }

      job.log(`[${site}] Scraping detail: ${url}`)

      let raw
      try {
        raw = await scraper.scrapeDetailPage(url)
      } catch (err) {
        if (scrapeRunId) {
          updateScrapeRun(scrapeRunId, { errors: 1 }).catch(() => null)
        }
        throw new Error(`[${site}] scrapeDetailPage failed for ${url}: ${(err as Error).message}`)
      }

      const normalized = normalize(raw)
      job.log(`[${site}] Normalized: ${normalized.make} ${normalized.model} ${normalized.year} — ${normalized.rawPriceStr ?? 'no price'}`)

      if (!isTargetListing(normalized.make, normalized.model)) {
        job.log(`[${site}] Skipped — not a target make/model`)
        return { site, url, created: 0, priceChanges: 0 }
      }

      const result = await sendBatch([normalized])
      job.log(`[${site}] Ingest result: ${JSON.stringify(result)}`)

      if (result.errors > 0) {
        job.log(`[${site}] Ingest errors: ${result.errorDetails.join(' | ')}`)
      }

      // Update audit log (fire-and-forget)
      if (scrapeRunId && (result.created || result.priceChanges || result.soldDetected)) {
        updateScrapeRun(scrapeRunId, {
          listingsNew: result.created,
          priceChanges: result.priceChanges,
          soldDetected: result.soldDetected,
        }).catch(() => null)
      }

      return { site, url, created: result.created, priceChanges: result.priceChanges, errors: result.errors, errorDetails: result.errorDetails }
    },
    {
      connection,
      concurrency: 3,
      lockDuration: 120_000,
      limiter: { max: 10, duration: 10_000 },
    }
  )
}
