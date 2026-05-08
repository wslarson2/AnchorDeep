import 'dotenv/config'
import { SourceSite } from '@anchordeep/shared'
import { triggerSearch } from './src/lib/queue.js'

async function start() {
  console.log('🚀 Triggering BoatTrader search...\n')
  try {
    await triggerSearch(SourceSite.BOAT_TRADER)
    console.log('✅ BoatTrader search triggered!')
    console.log('The scraper will start searching for Lagoon, Leopard, Fountaine Pajot, etc.')
  } catch (err) {
    console.error('❌ Error:', err)
  }
  process.exit(0)
}

start()
