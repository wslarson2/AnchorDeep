import 'dotenv/config'
import { normalize } from './pipeline/normalizer.js'
import { sendBatch } from './lib/api-client.js'
import { BoatType, HullMaterial, PropulsionType, SourceSite, ListingStatus } from '@anchordeep/shared'
import type { RawListingData } from '@anchordeep/shared'
import axios from 'axios'

const API = process.env.API_BASE_URL ?? 'http://localhost:3001'

function log(msg: string) { console.log(msg) }
function pass(msg: string) { console.log(`  ✓ ${msg}`) }
function fail(msg: string) { console.error(`  ✗ ${msg}`); process.exitCode = 1 }

// ─── Test data — two listings, second is a re-scrape with a lower price ───────

const listing1Raw: RawListingData = {
  externalId: 'TEST-001',
  sourceUrl: 'https://www.boats.com/boats/test-001/',
  site: SourceSite.BOATS_COM,
  title: '2020 Sea Ray SPX 190',
  rawPriceStr: '$32,500',
  make: 'Sea Ray',
  model: 'SPX 190',
  year: 2020,
  type: BoatType.POWERBOAT,
  lengthFt: 19,
  hullMaterial: HullMaterial.FIBERGLASS,
  propulsion: PropulsionType.STERNDRIVE,
  engineHours: 210,
  city: 'Clearwater',
  state: 'FL',
  description: null,
  imageUrls: ['https://images.unsplash.com/photo-1567899378494-47b22a2ae96a?w=400'],
  isSold: false,
  specs: { beam_ft: '8.0', engine_brand: 'MerCruiser', engine_hp: '200', fuel_type: 'Gasoline' },
  rawJson: { source: 'test' },
}

// Same listing, different source (cross-site dedup test)
const listing1AltRaw: RawListingData = {
  ...listing1Raw,
  externalId: 'BT-TEST-001',
  sourceUrl: 'https://www.boattrader.com/listing/bt-test-001/',
  site: SourceSite.BOAT_TRADER,
  rawPriceStr: '$32,500',
}

// Same listing re-scraped 1 day later with a price drop
const listing1PriceDropRaw: RawListingData = {
  ...listing1Raw,
  rawPriceStr: '$29,900',  // dropped $2,600
}

// A "sold" re-scrape
const listing1SoldRaw: RawListingData = {
  ...listing1Raw,
  rawPriceStr: '$29,900',
  isSold: true,
}

// ─── Run tests ────────────────────────────────────────────────────────────────

log('\n=== AnchorDeep Pipeline Test ===\n')

// Test 1: normalize raw data
log('1. Normalization')
const n1 = normalize(listing1Raw)
n1.priceUsd === 3250000 ? pass('price "$32,500" → 3250000 cents') : fail(`price: expected 3250000, got ${n1.priceUsd}`)
n1.status === ListingStatus.ACTIVE ? pass('status ACTIVE') : fail(`status: ${n1.status}`)
n1.state === 'FL' ? pass('state uppercase') : fail(`state: ${n1.state}`)
normalize({ ...listing1Raw, rawPriceStr: null }).priceUsd === null ? pass('null price stays null') : fail('null price failed')

// Test 2: sold detection via title keywords
const soldByTitle = normalize({ ...listing1Raw, title: 'SOLD 2020 Sea Ray SPX 190', isSold: false })
soldByTitle.status === ListingStatus.SOLD ? pass('sold detected via title keyword') : fail(`sold via title: ${soldByTitle.status}`)

log('\n2. Ingest — first scrape (new listing)')
const r1 = await sendBatch([normalize(listing1Raw)])
r1.created === 1 ? pass(`listing created (id lookup needed)`) : fail(`expected created=1, got ${JSON.stringify(r1)}`)
r1.errors === 0 ? pass('no errors') : fail(`errors: ${r1.errorDetails.join(', ')}`)

log('\n3. Ingest — re-scrape same listing, same price (idempotent)')
const r2 = await sendBatch([normalize(listing1Raw)])
r2.created === 0 ? pass('no duplicate created') : fail(`expected created=0, got ${r2.created}`)
r2.priceChanges === 0 ? pass('no spurious price change') : fail(`expected priceChanges=0, got ${r2.priceChanges}`)

log('\n4. Ingest — price drop')
const r3 = await sendBatch([normalize(listing1PriceDropRaw)])
r3.priceChanges === 1 ? pass('price change detected') : fail(`expected priceChanges=1, got ${r3.priceChanges}`)
r3.errors === 0 ? pass('no errors') : fail(`errors: ${r3.errorDetails.join(', ')}`)

log('\n5. Price history via API')
const { data: listings } = await axios.get(`${API}/api/v1/listings?make=Sea+Ray&model=SPX+190&status=ACTIVE`)
const testListing = listings.listings.find((l: any) => l.model === 'SPX 190' && l.year === 2020)
testListing ? pass(`listing found in search results`) : fail('listing not found in search results')

if (testListing) {
  const { data: history } = await axios.get(`${API}/api/v1/listings/${testListing.id}/price-history`)
  history.length >= 2 ? pass(`price history has ${history.length} snapshots`) : fail(`expected ≥2 snapshots, got ${history.length}`)

  const change = history.find((s: any) => s.priceChanged)
  change ? pass(`price drop snapshot: ${change.priceChangePct}% (${change.prevPriceUsd/100} → ${change.priceUsd/100})`) : fail('no price change snapshot found')

  const detail = await axios.get(`${API}/api/v1/listings/${testListing.id}`)
  detail.data.currentPriceUsd === 2990000
    ? pass('currentPriceUsd updated to dropped price')
    : fail(`currentPriceUsd: expected 2990000, got ${detail.data.currentPriceUsd}`)

  detail.data.specs.length > 0
    ? pass(`specs stored: ${detail.data.specs.map((s: any) => s.key).join(', ')}`)
    : fail('no specs stored')
}

log('\n6. Cross-site deduplication')
const r4 = await sendBatch([normalize(listing1AltRaw)])
r4.errors === 0 ? pass('alt-source ingest OK') : fail(`errors: ${r4.errorDetails.join(', ')}`)

if (testListing) {
  const detail2 = await axios.get(`${API}/api/v1/listings/${testListing.id}`)
  detail2.data.sources.length >= 2
    ? pass(`listing has ${detail2.data.sources.length} sources (cross-site dedup working)`)
    : fail(`expected ≥2 sources, got ${detail2.data.sources.length}`)
}

log('\n7. Sold detection')
const r5 = await sendBatch([normalize(listing1SoldRaw)])
r5.errors === 0 ? pass('sold ingest OK') : fail(`errors: ${r5.errorDetails.join(', ')}`)
r5.soldDetected === 1 ? pass('soldDetected=1 in ingest result') : fail(`soldDetected: expected 1, got ${r5.soldDetected} (full: ${JSON.stringify(r5)})`)

if (testListing) {
  const detail3 = await axios.get(`${API}/api/v1/listings/${testListing.id}`)
  detail3.data.status === 'SOLD'
    ? pass(`listing status = SOLD`)
    : fail(`expected status SOLD, got ${detail3.data.status}`)
  detail3.data.soldPriceUsd
    ? pass(`soldPriceUsd = $${detail3.data.soldPriceUsd / 100}`)
    : fail('soldPriceUsd not set')
}

log('\n' + (process.exitCode ? '❌ Some tests failed.' : '✅ All tests passed.') + '\n')
