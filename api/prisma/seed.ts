import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import crypto from 'crypto'

const prisma = new PrismaClient()

function fingerprint(make: string, model: string, year: number, length: number, state: string) {
  const parts = [make.toLowerCase(), model.toLowerCase(), String(year), String(Math.floor(length)), state.toLowerCase()]
  return crypto.createHash('sha256').update(parts.join('|')).digest('hex')
}

const specKeys = [
  { key: 'beam_ft', label: 'Beam (ft)', unit: 'ft', dataType: 'NUMBER' as const, sortOrder: 1 },
  { key: 'draft_ft', label: 'Draft (ft)', unit: 'ft', dataType: 'NUMBER' as const, sortOrder: 2 },
  { key: 'engine_brand', label: 'Engine Brand', unit: null, dataType: 'TEXT' as const, sortOrder: 3 },
  { key: 'engine_hp', label: 'Engine HP', unit: 'hp', dataType: 'NUMBER' as const, sortOrder: 4 },
  { key: 'fuel_type', label: 'Fuel Type', unit: null, dataType: 'TEXT' as const, sortOrder: 5 },
  { key: 'fuel_capacity_gal', label: 'Fuel Capacity', unit: 'gal', dataType: 'NUMBER' as const, sortOrder: 6 },
  { key: 'water_capacity_gal', label: 'Water Capacity', unit: 'gal', dataType: 'NUMBER' as const, sortOrder: 7 },
  { key: 'max_speed_kts', label: 'Max Speed', unit: 'kts', dataType: 'NUMBER' as const, sortOrder: 8 },
  { key: 'cabin_count', label: 'Cabins', unit: null, dataType: 'NUMBER' as const, sortOrder: 9 },
  { key: 'head_count', label: 'Heads', unit: null, dataType: 'NUMBER' as const, sortOrder: 10 },
]

interface SeedListing {
  make: string
  model: string
  year: number
  type: 'POWERBOAT' | 'SAILBOAT' | 'FISHING' | 'PONTOON' | 'PWC'
  lengthFt: number
  hullMaterial: 'FIBERGLASS' | 'ALUMINUM' | 'WOOD' | 'COMPOSITE'
  propulsion: 'INBOARD' | 'OUTBOARD' | 'JET' | 'SAIL'
  engineHours: number
  city: string
  state: string
  currentPriceUsd: number
  source: { site: 'BOATS_COM' | 'YACHT_WORLD' | 'BOAT_TRADER' | 'CRAIGSLIST' | 'EBAY_MOTORS'; externalId: string; url: string }
  images: string[]
  priceHistory: number[]
  specs: Record<string, string>
  status?: 'ACTIVE' | 'SOLD'
  soldAt?: Date
  soldPriceUsd?: number
}

const seedListings: SeedListing[] = [
  {
    make: 'Sea Ray', model: 'Sundancer 320', year: 2018, type: 'POWERBOAT',
    lengthFt: 32, hullMaterial: 'FIBERGLASS', propulsion: 'INBOARD',
    engineHours: 420, city: 'Fort Lauderdale', state: 'FL',
    currentPriceUsd: 8500000,
    source: { site: 'BOATS_COM', externalId: 'bc-001', url: 'https://www.boats.com/listing/bc-001' },
    images: ['https://images.unsplash.com/photo-1567899378494-47b22a2ae96a?w=800'],
    priceHistory: [9200000, 8800000, 8500000],
    specs: { beam_ft: '10.8', engine_brand: 'MerCruiser', engine_hp: '300', fuel_type: 'Gasoline' },
  },
  { make: 'Beneteau', model: 'Oceanis 45', year: 2016, type: 'SAILBOAT', lengthFt: 45, hullMaterial: 'FIBERGLASS', propulsion: 'SAIL', engineHours: 890, city: 'Annapolis', state: 'MD', currentPriceUsd: 18900000, source: { site: 'YACHT_WORLD', externalId: 'yw-002', url: 'https://www.yachtworld.com/listing/yw-002' }, images: ['https://images.unsplash.com/photo-1544551763-46a013bb70d5?w=800'], priceHistory: [20500000, 19500000, 18900000], specs: { beam_ft: '14.4', draft_ft: '6.6', cabin_count: '3', head_count: '2', fuel_type: 'Diesel' } },
  { make: 'Yamaha', model: 'AR240', year: 2021, type: 'POWERBOAT', lengthFt: 24, hullMaterial: 'FIBERGLASS', propulsion: 'JET', engineHours: 120, city: 'Lake Havasu City', state: 'AZ', currentPriceUsd: 4200000, source: { site: 'BOAT_TRADER', externalId: 'bt-003', url: 'https://www.boattrader.com/listing/bt-003' }, images: ['https://images.unsplash.com/photo-1605281317010-fe5ffe798166?w=800'], priceHistory: [4200000], specs: { beam_ft: '8.5', engine_brand: 'Yamaha', engine_hp: '180', fuel_type: 'Gasoline' } },
  { make: 'Grady-White', model: 'Canyon 271', year: 2019, type: 'FISHING', lengthFt: 27, hullMaterial: 'FIBERGLASS', propulsion: 'OUTBOARD', engineHours: 310, city: 'Morehead City', state: 'NC', currentPriceUsd: 6800000, source: { site: 'BOAT_TRADER', externalId: 'bt-004', url: 'https://www.boattrader.com/listing/bt-004' }, images: ['https://images.unsplash.com/photo-1590041794748-2d8eb73a571c?w=800'], priceHistory: [7500000, 7100000, 6800000], specs: { beam_ft: '9.5', engine_brand: 'Yamaha', engine_hp: '300', fuel_type: 'Gasoline', fuel_capacity_gal: '148' } },
  { make: 'Harris', model: 'Solstice 250', year: 2022, type: 'PONTOON', lengthFt: 25, hullMaterial: 'ALUMINUM', propulsion: 'OUTBOARD', engineHours: 55, city: 'Nashville', state: 'TN', currentPriceUsd: 5500000, source: { site: 'BOATS_COM', externalId: 'bc-005', url: 'https://www.boats.com/listing/bc-005' }, images: ['https://images.unsplash.com/photo-1618765645758-5b61a15c0e4b?w=800'], priceHistory: [5500000], specs: { beam_ft: '8.5', engine_brand: 'Mercury', engine_hp: '150', fuel_type: 'Gasoline' } },
  { make: 'Sea-Doo', model: 'GTX 300', year: 2023, type: 'PWC', lengthFt: 10, hullMaterial: 'COMPOSITE', propulsion: 'JET', engineHours: 22, city: 'Tampa', state: 'FL', currentPriceUsd: 1650000, source: { site: 'EBAY_MOTORS', externalId: 'em-006', url: 'https://www.ebay.com/itm/em-006' }, images: ['https://images.unsplash.com/photo-1531722569936-825d4eaf3af4?w=800'], priceHistory: [1800000, 1650000], specs: { engine_brand: 'Rotax', engine_hp: '300', fuel_type: 'Gasoline' } },
  { make: 'Catalina', model: '425', year: 2015, type: 'SAILBOAT', lengthFt: 42.5, hullMaterial: 'FIBERGLASS', propulsion: 'SAIL', engineHours: 1200, city: 'San Diego', state: 'CA', currentPriceUsd: 14500000, source: { site: 'YACHT_WORLD', externalId: 'yw-007', url: 'https://www.yachtworld.com/listing/yw-007' }, images: ['https://images.unsplash.com/photo-1565035010268-a3816f98589a?w=800'], priceHistory: [16000000, 15200000, 14500000], specs: { beam_ft: '13.5', draft_ft: '5.5', cabin_count: '2', head_count: '2', fuel_type: 'Diesel' } },
  { make: 'Ranger', model: 'RT178', year: 2020, type: 'FISHING', lengthFt: 17.8, hullMaterial: 'FIBERGLASS', propulsion: 'OUTBOARD', engineHours: 180, city: 'Tulsa', state: 'OK', currentPriceUsd: 2400000, source: { site: 'CRAIGSLIST', externalId: 'cl-008', url: 'https://tulsa.craigslist.org/boa/cl-008' }, images: ['https://images.unsplash.com/photo-1519046904884-53103b34b206?w=800'], priceHistory: [2600000, 2400000], specs: { engine_brand: 'Evinrude', engine_hp: '115', fuel_type: 'Gasoline' } },
  { make: 'Boston Whaler', model: 'Outrage 280', year: 2017, type: 'POWERBOAT', lengthFt: 28, hullMaterial: 'FIBERGLASS', propulsion: 'OUTBOARD', engineHours: 650, city: 'Newport', state: 'RI', currentPriceUsd: 7200000, source: { site: 'BOAT_TRADER', externalId: 'bt-009', url: 'https://www.boattrader.com/listing/bt-009' }, images: ['https://images.unsplash.com/photo-1569263979104-865ab7cd8d13?w=800'], priceHistory: [8000000, 7600000, 7200000], specs: { beam_ft: '9.2', engine_brand: 'Mercury', engine_hp: '300', fuel_type: 'Gasoline', fuel_capacity_gal: '100' } },
  { make: 'Chris-Craft', model: 'Launch 25', year: 2014, type: 'POWERBOAT', lengthFt: 25, hullMaterial: 'WOOD', propulsion: 'INBOARD', engineHours: 920, city: 'Lake Geneva', state: 'WI', currentPriceUsd: 9900000, status: 'SOLD', soldAt: new Date('2024-08-15'), soldPriceUsd: 9600000, source: { site: 'BOATS_COM', externalId: 'bc-010', url: 'https://www.boats.com/listing/bc-010' }, images: ['https://images.unsplash.com/photo-1553361371-9b22f78e8b1d?w=800'], priceHistory: [11000000, 10500000, 9900000, 9600000], specs: { beam_ft: '8.3', engine_brand: 'Crusader', engine_hp: '340', fuel_type: 'Gasoline' } },
]

async function main() {
  console.log('Seeding database...')

  // Upsert spec keys
  for (const sk of specKeys) {
    await prisma.specKey.upsert({
      where: { key: sk.key },
      create: sk,
      update: { label: sk.label, unit: sk.unit, dataType: sk.dataType, sortOrder: sk.sortOrder },
    })
  }

  const specKeyMap = Object.fromEntries(
    (await prisma.specKey.findMany()).map((sk) => [sk.key, sk.id])
  )

  for (const seed of seedListings) {
    const fp = fingerprint(seed.make, seed.model, seed.year, seed.lengthFt, seed.source.url.includes('craigslist') ? 'OK' : seed.state)

    const listing = await prisma.listing.upsert({
      where: { id: (await prisma.listing.findFirst({ where: { fingerprintHash: fp } }))?.id ?? '__none__' },
      create: {
        make: seed.make,
        model: seed.model,
        year: seed.year,
        type: seed.type,
        lengthFt: seed.lengthFt,
        hullMaterial: seed.hullMaterial,
        propulsion: seed.propulsion,
        engineHours: seed.engineHours,
        city: seed.city,
        state: seed.state,
        currentPriceUsd: seed.currentPriceUsd,
        status: seed.status ?? 'ACTIVE',
        soldAt: seed.soldAt ?? null,
        soldPriceUsd: seed.soldPriceUsd ?? null,
        fingerprintHash: fp,
        firstSeenAt: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000),
        lastSeenAt: new Date(),
      },
      update: { lastSeenAt: new Date() },
    })

    // Upsert source
    const existingSource = await prisma.listingSource.findUnique({
      where: { site_externalId: { site: seed.source.site, externalId: seed.source.externalId } },
    })
    if (!existingSource) {
      await prisma.listingSource.create({
        data: {
          listingId: listing.id,
          site: seed.source.site,
          externalId: seed.source.externalId,
          sourceUrl: seed.source.url,
          isActive: seed.status !== 'SOLD',
          soldHint: seed.status === 'SOLD',
          lastScrapedAt: new Date(),
          lastSuccessAt: new Date(),
        },
      })
    }

    // Create price history snapshots spaced over 90 days
    const existingSnapshots = await prisma.priceSnapshot.count({ where: { listingId: listing.id } })
    if (existingSnapshots === 0) {
      const prices = seed.priceHistory
      for (let i = 0; i < prices.length; i++) {
        const daysAgo = 90 - (i * Math.floor(90 / prices.length))
        const createdAt = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000)
        const prev = i > 0 ? prices[i - 1] : null
        const priceChanged = prev != null && prices[i] !== prev
        await prisma.priceSnapshot.create({
          data: {
            listingId: listing.id,
            sourceId: (await prisma.listingSource.findFirst({ where: { listingId: listing.id } }))!.id,
            priceUsd: prices[i],
            status: i === prices.length - 1 ? (seed.status ?? 'ACTIVE') : 'ACTIVE',
            priceChanged,
            priceChangePct: priceChanged && prev ? Math.round(((prices[i] - prev) / prev) * 10000) / 100 : null,
            prevPriceUsd: priceChanged ? prev : null,
            rawPriceStr: `$${(prices[i] / 100).toLocaleString()}`,
            createdAt,
          },
        })
      }
    }

    // Upsert images
    for (let i = 0; i < seed.images.length; i++) {
      const existing = await prisma.listingImage.findFirst({ where: { listingId: listing.id, url: seed.images[i] } })
      if (!existing) {
        await prisma.listingImage.create({
          data: { listingId: listing.id, url: seed.images[i], isThumbnail: i === 0, sortOrder: i },
        })
      }
    }

    // Upsert specs
    for (const [key, value] of Object.entries(seed.specs)) {
      const specKeyId = specKeyMap[key]
      if (!specKeyId) continue
      const valueNumber = /^[\d.]+$/.test(value.trim()) ? parseFloat(value) : null
      await prisma.listingSpec.upsert({
        where: { listingId_specKeyId: { listingId: listing.id, specKeyId } },
        create: { listingId: listing.id, specKeyId, valueText: value, valueNumber },
        update: { valueText: value, valueNumber },
      })
    }

    console.log(`  ✓ ${seed.year} ${seed.make} ${seed.model} (${seed.state})`)
  }

  console.log('Seed complete.')
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
