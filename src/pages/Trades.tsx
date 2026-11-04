import { useMemo } from 'react'
import { useSearchParams } from 'react-router'
import TradeCard from '../components/TradeCard'
import { managerName, useData, type Data, type Trade } from '../data'

// Every name that appears in a trade (players, drafted players, managers), for searching.
function searchText(data: Data, t: Trade) {
  const names: string[] = []
  for (const s of t.sides) {
    names.push(managerName(data, s.userId))
    for (const pid of s.players) names.push(data.players[pid]?.name ?? '')
    for (const key of s.picks) {
      const pid = data.values.picks[key]?.playerId
      if (pid) names.push(data.players[pid]?.name ?? '')
    }
  }
  return names.join(' ').toLowerCase()
}

export default function Trades() {
  const { data, error } = useData()
  const [params, setParams] = useSearchParams()
  const season = params.get('season') ?? ''
  const manager = params.get('manager') ?? ''
  const query = params.get('q') ?? ''
  const oldest = params.get('sort') === 'oldest'

  const set = (key: string, value: string) => {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    setParams(next, { replace: true })
  }

  const managerOptions = useMemo(() => {
    if (!data) return []
    const ids = new Set(data.trades.flatMap((t) => t.sides.map((s) => s.userId).filter((id): id is string => !!id)))
    return [...ids].map((id) => ({ id, name: managerName(data, id) })).sort((a, b) => a.name.localeCompare(b.name))
  }, [data])

  const filtered = useMemo(() => {
    if (!data) return []
    const q = query.trim().toLowerCase()
    const list = data.trades.filter(
      (t) =>
        (!season || t.season === season) &&
        (!manager || t.sides.some((s) => s.userId === manager)) &&
        (!q || searchText(data, t).includes(q)),
    )
    return oldest ? list : [...list].reverse()
  }, [data, season, manager, query, oldest])

  if (error) return <p className="error">{error}</p>
  if (!data) return <p className="muted">Loading trades…</p>

  const filtering = season || manager || query
  return (
    <>
      <h1>Trades</h1>
      <div className="filters">
        <input type="search" placeholder="Search player or manager" value={query} onChange={(e) => set('q', e.target.value)} />
        <select value={season} onChange={(e) => set('season', e.target.value)}>
          <option value="">All seasons</option>
          {[...data.league.seasons].reverse().map((s) => (
            <option key={s.season} value={s.season}>
              {s.season}
            </option>
          ))}
        </select>
        <select value={manager} onChange={(e) => set('manager', e.target.value)}>
          <option value="">All managers</option>
          {managerOptions.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
        <select value={oldest ? 'oldest' : ''} onChange={(e) => set('sort', e.target.value)}>
          <option value="">Newest first</option>
          <option value="oldest">Oldest first</option>
        </select>
      </div>
      <p className="muted small">
        {filtered.length} of {data.trades.length} trades
        {filtering && (
          <>
            {' · '}
            <button className="link" onClick={() => setParams({}, { replace: true })}>
              Clear filters
            </button>
          </>
        )}
      </p>
      <div className="trade-list">
        {filtered.map((t) => (
          <TradeCard key={t.id} data={data} trade={t} />
        ))}
      </div>
    </>
  )
}
