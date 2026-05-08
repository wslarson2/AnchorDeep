import 'dotenv/config'
import { PrismaClient, SourceSite } from '@prisma/client'
import { searchQueue } from './src/lib/queue.js'

const prisma = new PrismaClient()

async function diagnose() {
  console.log('🔍 Diagnosing BoatTrader...\n')

  // 1. Check all listings (active and inactive)
  console.log('1️⃣  LISTINGS IN DATABASE')
  console.log('─'.repeat(50))
  const allBT = await prisma.listingSource.findMany({
    where: { site: SourceSite.BOAT_TRADER },
    include: { listing: { select: { id: true, status: true } } },
  })
  console.log(`Total BoatTrader sources: ${allBT.length}`)

  const byStatus = new Map<string, number>()
  for (const source of allBT) {
    const status = source.listing?.status || 'UNKNOWN'
    byStatus.set(status, (byStatus.get(status) || 0) + 1)
  }

  for (const [status, count] of byStatus) {
    console.log(`  ${status}: ${count}`)
  }

  if (allBT.length > 0) {
    console.log(`\nSample listings:`)
    allBT.slice(0, 3).forEach(s => {
      console.log(`  - ${s.sourceUrl}`)
    })
  }

  // 2. Check job queue
  console.log('\n2️⃣  JOB QUEUE')
  console.log('─'.repeat(50))
  try {
    const allJobs = await searchQueue.getJobs(['waiting', 'active', 'delayed'])
    const btJobs = allJobs.filter(j => j.data.site === SourceSite.BOAT_TRADER)

    console.log(`Total jobs in queue: ${allJobs.length}`)
    console.log(`BoatTrader jobs: ${btJobs.length}`)

    if (btJobs.length > 0) {
      console.log(`\nBoatTrader jobs by state:`)
      const byState = new Map<string, number>()
      for (const job of btJobs) {
        const state = job._progress ? 'active' : job.delay > 0 ? 'delayed' : 'waiting'
        byState.set(state, (byState.get(state) || 0) + 1)
      }
      for (const [state, count] of byState) {
        console.log(`  ${state}: ${count}`)
      }
    }
  } catch (err) {
    console.log(`Error checking queue: ${(err as Error).message}`)
  }

  // 3. Check scrape history
  console.log('\n3️⃣  SCRAPE HISTORY')
  console.log('─'.repeat(50))
  const scrapeRuns = await prisma.scrapeRun.findMany({
    where: { site: SourceSite.BOAT_TRADER },
    orderBy: { startedAt: 'desc' },
    take: 5,
  })

  if (scrapeRuns.length > 0) {
    console.log(`Recent scrape runs (last 5):`)
    for (const run of scrapeRuns) {
      const status = run.completedAt ? '✓ DONE' : '⏳ RUNNING'
      const foundCount = run.listingsFound
      console.log(`  [${status}] ${run.startedAt.toISOString()} - Found: ${foundCount}, New: ${run.listingsNew}, Errors: ${run.errors}`)
    }
  } else {
    console.log('No scrape runs found')
  }

  // Summary & recommendation
  console.log('\n📋 SUMMARY')
  console.log('─'.repeat(50))
  console.log(`Active listings: ${allBT.filter(s => s.listing?.status === 'ACTIVE').length}`)
  console.log(`Total sources: ${allBT.length}`)

  if (allBT.length === 0) {
    console.log('\n⚠️  RECOMMENDATION: Trigger a fresh BoatTrader search')
    console.log('No listings found. The scraper is registered but has never')
    console.log('successfully scraped BoatTrader. Recommend running:')
    console.log('\n  await triggerSearch(SourceSite.BOAT_TRADER)\n')
  }

  await prisma.$disconnect()
}

diagnose().catch(console.error)
