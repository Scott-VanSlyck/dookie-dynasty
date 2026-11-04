import { Link } from 'react-router'
import { useData } from '../data'

export default function Home() {
  const { data, error } = useData()
  if (error) return <p className="error">{error}</p>
  if (!data) return <p className="muted">Loading…</p>

  const seasons = [...data.league.seasons].reverse()
  return (
    <>
      <h1>Dookie Dynasty</h1>
      <p className="muted">Trade rewind, league history and stats.</p>

      <Link to="/trades" className="cta">
        Browse all {data.trades.length} trades →
      </Link>

      <h2>Seasons</h2>
      <ul className="seasons">
        {seasons.map((s) => (
          <li key={s.leagueId}>
            <strong>{s.season}</strong>
            <span>{data.trades.filter((t) => t.season === s.season).length} trades</span>
            <span className="status">{s.status === 'complete' ? 'Complete' : `Week ${s.lastScoredWeek}`}</span>
          </li>
        ))}
      </ul>
      <p className="muted small">Data updated {new Date(data.league.builtAt).toLocaleString()}</p>
    </>
  )
}
