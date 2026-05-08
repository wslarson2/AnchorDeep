export enum SourceSite {
  BOAT_TRADER = 'BOAT_TRADER',
  YACHT_WORLD = 'YACHT_WORLD',
  BOATS_COM = 'BOATS_COM',
  EBAY_MOTORS = 'EBAY_MOTORS',
  CRAIGSLIST = 'CRAIGSLIST',
  FACEBOOK_MARKETPLACE = 'FACEBOOK_MARKETPLACE',
}

export const SOURCE_LABELS: Record<SourceSite, string> = {
  [SourceSite.BOAT_TRADER]: 'Boat Trader',
  [SourceSite.YACHT_WORLD]: 'YachtWorld',
  [SourceSite.BOATS_COM]: 'boats.com',
  [SourceSite.EBAY_MOTORS]: 'eBay Motors',
  [SourceSite.CRAIGSLIST]: 'Craigslist',
  [SourceSite.FACEBOOK_MARKETPLACE]: 'Facebook Marketplace',
}

export const RATE_LIMITS_RPM: Record<SourceSite, number> = {
  [SourceSite.BOAT_TRADER]: 10,
  [SourceSite.YACHT_WORLD]: 10,
  [SourceSite.BOATS_COM]: 15,
  [SourceSite.EBAY_MOTORS]: 30,
  [SourceSite.CRAIGSLIST]: 5,
  [SourceSite.FACEBOOK_MARKETPLACE]: 5,
}
