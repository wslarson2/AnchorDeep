import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceDot,
  Legend,
} from 'recharts'
import type { PriceSnapshotDto } from '@anchordeep/shared'

interface Props {
  snapshots: PriceSnapshotDto[]
  soldPriceUsd?: number | null
}

const SITE_COLORS: Record<string, string> = {
  BOAT_TRADER: '#1d4ed8',
  YACHT_WORLD: '#16a34a',
  BOATS_COM:   '#ea580c',
  EBAY_MOTORS: '#9333ea',
  CRAIGSLIST:  '#dc2626',
}

const SITE_LABELS: Record<string, string> = {
  BOAT_TRADER: 'BoatTrader',
  YACHT_WORLD: 'YachtWorld',
  BOATS_COM:   'Boats.com',
  EBAY_MOTORS: 'eBay Motors',
  CRAIGSLIST:  'Craigslist',
}

function formatPrice(cents: number) {
  return `$${(cents / 100).toLocaleString()}`
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' })
}

export default function PriceHistoryChart({ snapshots, soldPriceUsd }: Props) {
  if (!snapshots.length) {
    return <div className="h-48 flex items-center justify-center text-gray-400 text-sm">No price history yet</div>
  }

  // Group by site
  const bySite = new Map<string, PriceSnapshotDto[]>()
  for (const s of snapshots) {
    const site = s.site ?? 'UNKNOWN'
    if (!bySite.has(site)) bySite.set(site, [])
    bySite.get(site)!.push(s)
  }

  const sites = Array.from(bySite.keys())

  // Merge all dates into one flat array, one key per site
  const allDates = [...new Set(snapshots.map((s) => formatDate(s.createdAt)))].sort(
    (a, b) => new Date(a).getTime() - new Date(b).getTime()
  )

  const data = allDates.map((date) => {
    const point: Record<string, any> = { date }
    for (const [site, pts] of bySite) {
      const match = pts.find((p) => formatDate(p.createdAt) === date)
      if (match) point[site] = match.priceUsd
    }
    return point
  })

  const soldSnap = soldPriceUsd != null ? snapshots[snapshots.length - 1] : null

  return (
    <ResponsiveContainer width="100%" height={240}>
      <LineChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
        <XAxis dataKey="date" tick={{ fontSize: 11 }} tickLine={false} />
        <YAxis
          tickFormatter={(v) => `$${(v / 100 / 1000).toFixed(0)}k`}
          tick={{ fontSize: 11 }}
          tickLine={false}
          axisLine={false}
          width={48}
        />
        <Tooltip
          formatter={(value: number, name: string) => [formatPrice(value), SITE_LABELS[name] ?? name]}
          labelStyle={{ fontSize: 12 }}
          contentStyle={{ fontSize: 12, borderRadius: 6 }}
        />
        <Legend
          formatter={(value) => SITE_LABELS[value] ?? value}
          wrapperStyle={{ fontSize: 12 }}
        />
        {sites.map((site) => (
          <Line
            key={site}
            type="monotone"
            dataKey={site}
            stroke={SITE_COLORS[site] ?? '#6b7280'}
            strokeWidth={2}
            dot={{ r: 3, fill: SITE_COLORS[site] ?? '#6b7280' }}
            activeDot={{ r: 5 }}
            connectNulls
          />
        ))}
        {soldSnap && (
          <ReferenceDot
            x={formatDate(soldSnap.createdAt)}
            y={soldSnap.priceUsd}
            r={6}
            fill="#dc2626"
            stroke="#fff"
            strokeWidth={2}
            label={{ value: 'SOLD', position: 'top', fontSize: 10, fill: '#dc2626' }}
          />
        )}
      </LineChart>
    </ResponsiveContainer>
  )
}
