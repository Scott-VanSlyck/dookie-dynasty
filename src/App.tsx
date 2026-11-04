import { useEffect, useState } from 'react'
import { getLeagueHistory, type League } from './sleeper'

export default function App() {
  const [seasons, setSeasons] = useState<League[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    getLeagueHistory().then(setSeasons).catch((e: Error) => setError(e.message))
  }, [])

  return (
    <main>
      <h1>Dookie Dynasty</h1>
      <p className="tagline">Trade rewind, league history and stats.</p>

      {error && <p className="error">Couldn't reach Sleeper: {error}</p>}
      {!seasons && !error && <p>Loading league history…</p>}

      {seasons && (
        <section>
          <h2>Seasons</h2>
          <ul className="seasons">
            {seasons.map((s) => (
              <li key={s.league_id}>
                <strong>{s.season}</strong>
                <span>{s.total_rosters} teams</span>
                <span className="status">{s.status.replace('_', ' ')}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="coming-soon">Coming soon: every trade, and who won it.</p>
    </main>
  )
}
