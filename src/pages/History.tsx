import { useTitle } from '../useTitle'
import { useMemo } from 'react'
import { useSearchParams } from 'react-router'
import ManagerLink, { Avatar } from '../components/ManagerLink'
import { useData, type Data, type Season } from '../data'
import { allGames, allTime, finish, headToHead, records } from '../history'

const pct = (w: number, l: number, t: number) => ((w + t / 2) / Math.max(1, w + l + t)).toFixed(3).replace(/^0/, '')
const fmt = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 0 })

function ChampionCard({ data, season }: { data: Data; season: Season }) {
  const owner = (rid?: number) => season.standings.find((t) => t.rosterId === rid)?.userId ?? null
  const places = season.playoffs?.places ?? {}
  const done = season.playoffs?.complete
  const leader = season.standings[0]
  return (
    <div className={`champ-card ${done ? '' : 'in-progress'}`}>
      <span className="muted small">{season.season}</span>
      {done ? (
        <>
          <span className="trophy" aria-hidden>
            🏆
          </span>
          <div className="champ-name">
            <Avatar src={data.league.managers[owner(places[1]) ?? '']?.avatar ?? null} size={28} />
            <ManagerLink data={data} userId={owner(places[1])} />
          </div>
          <span className="muted small">
            Beat <ManagerLink data={data} userId={owner(places[2])} /> in the final
          </span>
        </>
      ) : (
        <>
          <span className="trophy" aria-hidden>
            ⏳
          </span>
          <div className="champ-name">
            <span className="muted">In progress</span>
          </div>
          <span className="muted small">
            Week {season.lastScoredWeek} leader: <ManagerLink data={data} userId={leader?.userId ?? null} /> ({leader?.wins}-{leader?.losses})
          </span>
        </>
      )}
    </div>
  )
}

function Standings({ data, season }: { data: Data; season: Season }) {
  return (
    <div className="table-scroll">
      <table className="leaderboard">
        <thead>
          <tr>
            <th>#</th>
            <th>Team</th>
            <th className="num">Record</th>
            <th className="num">Points for</th>
            <th className="num hide-sm">Points against</th>
            <th className="num hide-sm" title="Points scored as a share of the best possible lineup's points">Lineup %</th>
            <th>Finish</th>
          </tr>
        </thead>
        <tbody>
          {season.standings.map((t, i) => {
            const f = finish(season, t.rosterId)
            return (
              <tr key={t.rosterId}>
                <td className="muted">{i + 1}</td>
                <td>
                  <div className="asset">
                    <Avatar src={data.league.managers[t.userId]?.avatar ?? null} />
                    <span>
                      <ManagerLink data={data} userId={t.userId} />
                      {t.teamName && (
                        <span className="muted small hide-sm">
                          <br />
                          {t.teamName}
                        </span>
                      )}
                    </span>
                  </div>
                </td>
                <td className="num">
                  {t.wins}-{t.losses}
                  {t.ties ? `-${t.ties}` : ''}
                </td>
                <td className="num">{t.pf.toFixed(2)}</td>
                <td className="num hide-sm">{t.pa.toFixed(2)}</td>
                <td className="num hide-sm">{t.maxPf ? `${((t.pf / t.maxPf) * 100).toFixed(1)}%` : '-'}</td>
                <td>{f ? <span className={`finish finish-${f.split(' ')[0].toLowerCase()}`}>{f === 'Champion' ? '🏆 Champion' : f}</span> : <span className="muted">-</span>}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

export default function History() {
  const { data, error } = useData()
  const [params, setParams] = useSearchParams()
  useTitle('League history')
  const set = (key: string, value: string) => {
    const next = new URLSearchParams(params)
    next.set(key, value)
    setParams(next, { replace: true })
  }

  const computed = useMemo(() => {
    if (!data) return null
    const games = allGames(data)
    return { games, allTime: allTime(data), records: records(data, games) }
  }, [data])

  if (error) return <p className="error">{error}</p>
  if (!data || !computed) return <p className="muted">Loading…</p>

  const seasons = [...data.league.seasons].reverse()
  const season = seasons.find((s) => s.season === params.get('season')) ?? seasons[0]
  const h2hUser = params.get('h2h') ?? computed.allTime[0]?.userId ?? ''
  const h2h = headToHead(computed.games, h2hUser)
  const name = (id: string) => data.league.managers[id]?.name ?? 'Unknown'

  return (
    <>
      <h1>League history</h1>
      <p className="muted">Every season of {data.league.name}.</p>

      <h2>Champions</h2>
      <div className="champs">
        {seasons.map((s) => (
          <ChampionCard key={s.season} data={data} season={s} />
        ))}
      </div>

      <h2>Standings</h2>
      <div className="tabs">
        {seasons.map((s) => (
          <button key={s.season} className={s.season === season.season ? 'active' : ''} onClick={() => set('season', s.season)}>
            {s.season}
          </button>
        ))}
      </div>
      <Standings data={data} season={season} />
      <p className="muted small">Records include the weekly game against the league median, so each week counts as two games.</p>

      <h2>All-time</h2>
      <div className="table-scroll">
        <table className="leaderboard">
          <thead>
            <tr>
              <th>Manager</th>
              <th className="num">Seasons</th>
              <th className="num">Titles</th>
              <th className="num hide-sm">Finals</th>
              <th className="num">Playoffs</th>
              <th className="num">Record</th>
              <th className="num">Win %</th>
              <th className="num hide-sm">Points / season</th>
              <th className="num">Lineup %</th>
            </tr>
          </thead>
          <tbody>
            {computed.allTime.map((r) => (
              <tr key={r.userId}>
                <td>
                  <div className="asset">
                    <Avatar src={data.league.managers[r.userId]?.avatar ?? null} />
                    <ManagerLink data={data} userId={r.userId} />
                  </div>
                </td>
                <td className="num">{r.seasons}</td>
                <td className="num">{r.titles ? '🏆'.repeat(r.titles) : '-'}</td>
                <td className="num hide-sm">{r.finals}</td>
                <td className="num">{r.playoffs}</td>
                <td className="num">
                  {r.wins}-{r.losses}
                  {r.ties ? `-${r.ties}` : ''}
                </td>
                <td className="num">{pct(r.wins, r.losses, r.ties)}</td>
                <td className="num hide-sm">{fmt(r.pf / r.seasons)}</td>
                <td className="num">{r.maxPf ? `${((r.pf / r.maxPf) * 100).toFixed(1)}%` : '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="muted small">Titles, finals and playoff trips count finished seasons only. Points per season include the current season.</p>

      <h2>Records</h2>
      <div className="records">
        {computed.records.map((r) => (
          <div key={r.title} className="record">
            <span className="muted small">{r.title}</span>
            <strong>{r.value}</strong>
            <span>
              <ManagerLink data={data} userId={r.who} />
            </span>
            <span className="muted small">{r.detail}</span>
          </div>
        ))}
      </div>

      <h2>Head-to-head</h2>
      <div className="filters">
        <select value={h2hUser} onChange={(e) => set('h2h', e.target.value)}>
          {[...computed.allTime]
            .sort((a, b) => name(a.userId).localeCompare(name(b.userId)))
            .map((r) => (
              <option key={r.userId} value={r.userId}>
                {name(r.userId)}
              </option>
            ))}
        </select>
      </div>
      <div className="table-scroll">
        <table className="leaderboard">
          <thead>
            <tr>
              <th>Opponent</th>
              <th className="num">Record</th>
              <th className="num">Points for</th>
              <th className="num">Points against</th>
              <th className="num">Avg margin</th>
            </tr>
          </thead>
          <tbody>
            {h2h.map((r) => {
              const games = r.wins + r.losses + r.ties
              const margin = (r.pf - r.pa) / Math.max(1, games)
              return (
                <tr key={r.opponent}>
                  <td>
                    <ManagerLink data={data} userId={r.opponent} />
                  </td>
                  <td className={`num ${r.wins > r.losses ? 'gain' : r.wins < r.losses ? 'drop' : ''}`}>
                    {r.wins}-{r.losses}
                    {r.ties ? `-${r.ties}` : ''}
                  </td>
                  <td className="num">{r.pf.toFixed(2)}</td>
                  <td className="num">{r.pa.toFixed(2)}</td>
                  <td className="num">
                    {margin > 0 ? '+' : ''}
                    {margin.toFixed(1)}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="muted small">Head-to-head counts real matchups only (regular season and playoffs), not median games.</p>
    </>
  )
}
