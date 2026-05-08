import { BoatType, PropulsionType, HullMaterial } from '@anchordeep/shared'
import { useFilterStore } from '../../store/filters.store.ts'

const BOAT_TYPES = Object.values(BoatType)
const PROPULSION_TYPES = Object.values(PropulsionType)
const US_STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS',
  'KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY',
  'NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY',
]

export default function FilterSidebar() {
  const { filters, setFilter, setFilters, resetFilters } = useFilterStore()

  return (
    <aside className="w-64 shrink-0 space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-gray-800">Filters</h2>
        <button onClick={resetFilters} className="text-xs text-ocean-600 hover:underline">Reset all</button>
      </div>

      {/* Boat Type */}
      <Section title="Boat Type">
        <div className="space-y-1">
          {BOAT_TYPES.map((t) => (
            <label key={t} className="flex items-center gap-2 cursor-pointer text-sm">
              <input
                type="radio"
                name="boatType"
                checked={filters.type === t}
                onChange={() => setFilter('type', filters.type === t ? undefined : t)}
                className="accent-anchor-600"
              />
              <span className="capitalize">{t.toLowerCase()}</span>
            </label>
          ))}
        </div>
      </Section>

      {/* Price Range */}
      <Section title="Price">
        <div className="flex gap-2">
          <input
            type="number"
            placeholder="Min $"
            value={filters.priceMin ? filters.priceMin / 100 : ''}
            onChange={(e) => setFilter('priceMin', e.target.value ? parseInt(e.target.value) * 100 : undefined)}
            className="w-full border rounded px-2 py-1 text-sm"
          />
          <input
            type="number"
            placeholder="Max $"
            value={filters.priceMax ? filters.priceMax / 100 : ''}
            onChange={(e) => setFilter('priceMax', e.target.value ? parseInt(e.target.value) * 100 : undefined)}
            className="w-full border rounded px-2 py-1 text-sm"
          />
        </div>
      </Section>

      {/* Year Range */}
      <Section title="Year">
        <div className="flex gap-2">
          <input
            type="number"
            placeholder="Min"
            value={filters.yearMin ?? ''}
            onChange={(e) => setFilter('yearMin', e.target.value ? parseInt(e.target.value) : undefined)}
            className="w-full border rounded px-2 py-1 text-sm"
          />
          <input
            type="number"
            placeholder="Max"
            value={filters.yearMax ?? ''}
            onChange={(e) => setFilter('yearMax', e.target.value ? parseInt(e.target.value) : undefined)}
            className="w-full border rounded px-2 py-1 text-sm"
          />
        </div>
      </Section>

      {/* Length */}
      <Section title="Length (ft)">
        <div className="flex gap-2">
          <input
            type="number"
            placeholder="Min"
            value={filters.lengthMin ?? ''}
            onChange={(e) => setFilter('lengthMin', e.target.value ? parseFloat(e.target.value) : undefined)}
            className="w-full border rounded px-2 py-1 text-sm"
          />
          <input
            type="number"
            placeholder="Max"
            value={filters.lengthMax ?? ''}
            onChange={(e) => setFilter('lengthMax', e.target.value ? parseFloat(e.target.value) : undefined)}
            className="w-full border rounded px-2 py-1 text-sm"
          />
        </div>
      </Section>

      {/* State */}
      <Section title="State">
        <select
          value={filters.state ?? ''}
          onChange={(e) => setFilter('state', e.target.value || undefined)}
          className="w-full border rounded px-2 py-1.5 text-sm bg-white"
        >
          <option value="">All states</option>
          {US_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </Section>

      {/* Propulsion */}
      <Section title="Propulsion">
        <div className="space-y-1">
          {PROPULSION_TYPES.map((p) => (
            <label key={p} className="flex items-center gap-2 cursor-pointer text-sm">
              <input
                type="radio"
                name="propulsion"
                checked={filters.propulsion === p}
                onChange={() => setFilter('propulsion', filters.propulsion === p ? undefined : p)}
                className="accent-anchor-600"
              />
              <span className="capitalize">{p.toLowerCase()}</span>
            </label>
          ))}
        </div>
      </Section>
    </aside>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">{title}</h3>
      {children}
    </div>
  )
}
