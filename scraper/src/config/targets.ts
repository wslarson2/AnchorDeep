/**
 * Target makes and models for focused scraping.
 * Page N in fetchListingUrls maps to MAKES[N-1] — one make per page slot.
 * Models are used for post-filtering; null means accept any model for that make.
 */

export interface TargetMake {
  make: string
  /** Lowercase substrings that must appear in the model string to pass the filter */
  models: string[]
  /** URL-encoded make name used in search query params */
  makeParam: string
}

export const TARGET_MAKES: TargetMake[] = [
  {
    make: 'Lagoon',
    models: ['380', '400', '450'],
    makeParam: 'Lagoon',
  },
  {
    make: 'Leopard',
    models: ['44'],
    makeParam: 'Leopard',
  },
  {
    make: 'Fountaine Pajot',
    models: ['helia 44', 'lucia 40', 'orana 44'],
    makeParam: 'Fountaine+Pajot',
  },
  { make: 'Nautitech', models: [], makeParam: 'Nautitech' },
  { make: 'Catana', models: [], makeParam: 'Catana' },
  { make: 'Excess', models: [], makeParam: 'Excess' },
  { make: 'Bali', models: [], makeParam: 'Bali' },
  { make: 'Aventura', models: [], makeParam: 'Aventura' },
  { make: 'Seawind', models: [], makeParam: 'Seawind' },
]

/** All target models as flat lowercase strings for quick matching */
export const ALL_TARGET_MODELS: string[] = TARGET_MAKES.flatMap((m) =>
  m.models.map((mod) => mod.toLowerCase())
)

/**
 * Returns true if this make+model combination matches a scraping target.
 * Called after normalization to drop non-target listings.
 */
export function isTargetListing(make: string | null, _model: string | null): boolean {
  if (!make) return false
  const makeLower = make.toLowerCase()
  return TARGET_MAKES.some((t) => makeLower.includes(t.make.toLowerCase()))
}

/** Craigslist search terms — one per make, broad enough to catch all target models */
export const CL_SEARCH_TERMS = ['lagoon', 'leopard', 'fountaine pajot', 'Nautitech', 'Catana', 'Excess', 'Bali', 'Aventura', 'Seawind']

/** Maximum boat length (ft) used in all search URLs */
export const MAX_LENGTH_FT = 46

/**
 * Builds the combined makes string for sites that accept all makes in one URL.
 * e.g. buildMakeParam('+') → "Lagoon+Leopard+Fountaine+Pajot"
 */
export function buildMakeParam(separator = '+'): string {
  return TARGET_MAKES.map(t => t.makeParam).join(separator)
}
