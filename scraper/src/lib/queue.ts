import { Queue, Worker, QueueEvents } from 'bullmq'
import type { SourceSite } from '@anchordeep/shared'
import { createScrapeRun } from './api-client.js'

const connection = {
  host: new URL(process.env.REDIS_URL ?? 'redis://localhost:6379').hostname,
  port: parseInt(new URL(process.env.REDIS_URL ?? 'redis://localhost:6379').port || '6379', 10),
}

// ─── Job Payloads ─────────────────────────────────────────────────────────────

export interface SearchJob {
  site: SourceSite
  page: number
  scrapeRunId?: string
  category?: string
}

export interface DetailJob {
  site: SourceSite
  url: string
  externalId: string
  scrapeRunId?: string
}

export interface StalenessJob {
  site: SourceSite
  listingSourceIds: string[]
}

// ─── Queue Names ──────────────────────────────────────────────────────────────

export const QUEUE_SEARCH = 'scrape_search'   // collect listing URLs from search pages
export const QUEUE_DETAIL = 'scrape_detail'   // fetch individual listing detail pages
export const QUEUE_STALE  = 'scrape_stale'    // re-check listings not seen recently

// ─── Queue Instances ──────────────────────────────────────────────────────────

export const searchQueue = new Queue<SearchJob>(QUEUE_SEARCH, {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 30_000 },
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 500 },
  },
})

export const detailQueue = new Queue<DetailJob>(QUEUE_DETAIL, {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 15_000 },
    removeOnComplete: { count: 200 },
    removeOnFail: { count: 500 },
  },
})

export const staleQueue = new Queue<StalenessJob>(QUEUE_STALE, {
  connection,
  defaultJobOptions: {
    attempts: 2,
    backoff: { type: 'fixed', delay: 60_000 },
    removeOnComplete: { count: 50 },
    removeOnFail: { count: 100 },
  },
})

export { connection }

// ─── Repeatable Job Schedules ─────────────────────────────────────────────────

export async function scheduleRecurringJobs(enabledSites: SourceSite[]) {
  // Remove existing repeatable jobs first so schedules don't stack on restart
  const existing = await searchQueue.getRepeatableJobs()
  for (const job of existing) {
    await searchQueue.removeRepeatableByKey(job.key)
  }

  for (const site of enabledSites) {
    // Full search scrape every 6 hours
    await searchQueue.add(
      `${site}:full-search`,
      { site, page: 1 },
      {
        repeat: { pattern: '0 */6 * * *' },
        jobId: `repeatable:${site}:search`,
      }
    )
  }

  console.log(`Scheduled recurring search jobs for: ${enabledSites.join(', ')}`)
}

export const MAX_SEARCH_PAGES = 10

// ─── Trigger an immediate full search for a site (page 1 only — self-chains) ──

export async function triggerSearch(site: SourceSite) {
  let scrapeRunId: string | undefined
  try {
    scrapeRunId = await createScrapeRun(site)
  } catch {
    // API may not be running yet; scrape still proceeds without audit log
  }

  await searchQueue.add(
    `${site}:search:p1`,
    { site, page: 1, scrapeRunId },
  )
  console.log(`Queued search page 1 for ${site}${scrapeRunId ? ` (run: ${scrapeRunId})` : ''}`)
}

// ─── Enqueue next search page (called by worker after processing current page) ─

export async function enqueueNextSearchPage(
  site: SourceSite,
  currentPage: number,
  scrapeRunId?: string
): Promise<void> {
  const next = currentPage + 1
  if (next > MAX_SEARCH_PAGES) return
  await searchQueue.add(`${site}:search:p${next}`, { site, page: next, scrapeRunId })
}
