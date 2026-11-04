import { useMemo } from 'react'
import { Link } from 'react-router'
import ManagerLink, { Avatar } from '../components/ManagerLink'
import { formatDate, managerName, pickLabel, useData, type Data, type Trade } from '../data'
import { finish } from '../history'
import { allManagerIds, managerStats, signed } from '../managers'
import { todayVerdicts, tradeGaps } from '../rewind'
import { useTitle } from '../useTitle'

// What a side received, in a few words: "Ja'Marr Chase + 2 picks".
function gotSummary(data: Data, trade: Trade, i: number) {
  const s = trade.sides[i]
  const names = s.players.map((pid) => data.players[pid]?.name ?? pid)
  const picks = s.picks.map((k) => pickLabel(data.values.picks[k]))
  const all = [...names, ...picks]
  if (!all.length) return s.faab > 0 ? `$${s.faab} FAAB` : 'nothing'
  return all.length <= 2 ? all.join(' + ') : `${all[0]} + ${all.length - 1} more`
}

function TradeLine({ data, trade, note }: { data: Data; trade: Trade; note?: string }) {
  const v = todayVerdicts(data, trade).value
  return (
    <Link to={`/trades/${trade.id}`} className="dash-row">
      <span className="muted small">{note ?? formatDate(trade.date)}</span>
      <span>
        {trade.sides.map((s, i) => (
          <span key={s.rosterId}>
            {i > 0 && <span className="muted"> ⇄ </span>}
            <strong>{managerName(data, s.userId)}</strong> <span className="muted small">gets {gotSummary(data, trade, i)}</span>
          </span>
        ))}
      </span>
      <span className="small">
        {v.winner == null ? (
          <span className="muted">{v.label}</span>
        ) : (
          <>
            <span className="muted">KTC today:</span> {managerName(data, trade.sides[v.winner].userId)}{' '}
            <span className="gain">{signed(Math.round(v.gap))}</span>
          </>
        )}
      </span>
    </Link>
  )
}

export default function Home() {
  const { data, error } = useData()
  useTitle(null)

  const dash = useMemo(() => {
    if (!data) return null
    const current = data.league.seasons.at(-1)!
    const lastDone = [...data.league.seasons].reverse().find((s) => s.playoffs?.complete)
    const champ = lastDone?.standings.find((t) => finish(lastDone, t.rosterId) === 'Champion')
    const latest = data.trades.slice(-4).reverse()
    const heists = [...data.trades].map((t) => ({ t, gap: tradeGaps(data, t).valueToday })).sort((a, b) => b.gap - a.gap).slice(0, 4)
    const traders = allManagerIds(data)
      .map((id) => managerStats(data, id))
      .filter((m) => m.trades.length > 0)
      .sort((a, b) => b.netValue - a.netValue)
    const draft = data.drafts.at(-1)
    return { current, lastDone, champ, latest, heists, traders, draft }
  }, [data])

  if (error) return <p className="error">{error}</p>
  if (!data || !dash) return <p className="muted">Loading…</p>
  const { current, lastDone, champ, latest, heists, traders } = dash

  return (
    <>
      <section className="hero">
        <div>
          <h1>{data.league.name}</h1>
          <p className="muted">
            12-team superflex dynasty · {current.season} season, {current.status === 'complete' ? 'complete' : `week ${current.lastScoredWeek}`} ·{' '}
            {data.trades.length} trades since {data.league.seasons[0].season}
          </p>
        </div>
        {champ && lastDone && (
          <Link to="/history" className="champ-mini">
            <span className="trophy" aria-hidden>
              🏆
            </span>
            <Avatar src={data.league.managers[champ.userId]?.avatar ?? null} size={36} />
            <span>
              <span className="muted small">{lastDone.season} champion</span>
              <br />
              <strong>{managerName(data, champ.userId)}</strong>
            </span>
          </Link>
        )}
      </section>

      <div className="dash">
        <section className="dash-card">
          <header>
            <h2>{current.season} standings</h2>
            <Link to={`/history?season=${current.season}`} className="small">
              Full standings →
            </Link>
          </header>
          <table className="mini">
            <tbody>
              {current.standings.slice(0, 6).map((t, i) => (
                <tr key={t.rosterId}>
                  <td className="muted">{i + 1}</td>
                  <td>
                    <ManagerLink data={data} userId={t.userId} />
                  </td>
                  <td className="num">
                    {t.wins}-{t.losses}
                  </td>
                  <td className="num muted">{t.pf.toFixed(1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="dash-card">
          <header>
            <h2>Trade leaderboard</h2>
            <Link to="/managers" className="small">
              All managers →
            </Link>
          </header>
          <table className="mini">
            <tbody>
              {[...traders.slice(0, 3), null, ...traders.slice(-2)].map((m, i) =>
                m ? (
                  <tr key={m.userId}>
                    <td className="muted">{traders.indexOf(m) + 1}</td>
                    <td>
                      <ManagerLink data={data} userId={m.userId} />
                    </td>
                    <td className="num muted small">{m.trades.length} trades</td>
                    <td className={`num ${m.netValue >= 0 ? 'gain' : 'drop'}`}>{signed(m.netValue)}</td>
                  </tr>
                ) : (
                  <tr key={`gap-${i}`}>
                    <td colSpan={4} className="muted small center">⋯</td>
                  </tr>
                ),
              )}
            </tbody>
          </table>
          <p className="muted small">Net KTC value gained from trading, as of today.</p>
        </section>

        <section className="dash-card wide">
          <header>
            <h2>Latest trades</h2>
            <Link to="/trades" className="small">
              All {data.trades.length} trades →
            </Link>
          </header>
          {latest.map((t) => (
            <TradeLine key={t.id} data={data} trade={t} />
          ))}
        </section>

        <section className="dash-card wide">
          <header>
            <h2>Biggest heists</h2>
            <Link to="/trades?sort=lopsided" className="small">
              See more →
            </Link>
          </header>
          {heists.map(({ t }) => (
            <TradeLine key={t.id} data={data} trade={t} note={`${formatDate(t.date)} · ${todayVerdicts(data, t).value.label}`} />
          ))}
        </section>
      </div>

      <p className="muted small">
        Data refreshes every morning from Sleeper and KeepTradeCut. Last update {new Date(data.league.builtAt).toLocaleString()}.
      </p>
    </>
  )
}
