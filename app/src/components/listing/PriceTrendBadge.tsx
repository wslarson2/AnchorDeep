interface Props {
  pct: number | null
}

export default function PriceTrendBadge({ pct }: Props) {
  if (pct == null) return null

  const isDown = pct < 0
  const label = isDown
    ? `↓ ${Math.abs(pct).toFixed(1)}% / 30d`
    : `↑ ${pct.toFixed(1)}% / 30d`

  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${
        isDown ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
      }`}
    >
      {label}
    </span>
  )
}
