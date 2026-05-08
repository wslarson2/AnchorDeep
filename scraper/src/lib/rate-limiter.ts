import type { SourceSite } from '@anchordeep/shared'
import { RATE_LIMITS_RPM } from '@anchordeep/shared'

const tokenBuckets = new Map<SourceSite, { tokens: number; lastRefill: number }>()

function getBucket(site: SourceSite) {
  if (!tokenBuckets.has(site)) {
    tokenBuckets.set(site, { tokens: RATE_LIMITS_RPM[site], lastRefill: Date.now() })
  }
  return tokenBuckets.get(site)!
}

/** Waits until a request token is available for the given site. */
export async function acquireToken(site: SourceSite): Promise<void> {
  const rpm = RATE_LIMITS_RPM[site]
  const msPerToken = (60 * 1000) / rpm

  while (true) {
    const bucket = getBucket(site)
    const now = Date.now()
    const elapsed = now - bucket.lastRefill
    const refill = Math.floor(elapsed / msPerToken)

    if (refill > 0) {
      bucket.tokens = Math.min(rpm, bucket.tokens + refill)
      bucket.lastRefill = now
    }

    if (bucket.tokens > 0) {
      bucket.tokens--
      return
    }

    const waitMs = msPerToken - (now - bucket.lastRefill) + Math.random() * 500
    await sleep(waitMs)
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
