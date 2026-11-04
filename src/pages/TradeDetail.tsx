import { Link, useParams } from 'react-router'
import ManagerLink from '../components/ManagerLink'
import ValueChart from '../components/ValueChart'
import { formatDate, headshot, managerName, pickLabel, pickOriginalOwner, useData, type Data, type Trade, type TradeSide } from '../data'
import { peakSince, pickSeries, playerPoints, rewind, snapshotIndex, today, valueHistory, type Verdict } from '../rewind'

function VerdictText({ data, trade, v }: { data: Data; trade: Trade; v: Verdict }) {
  if (v.winner == null) return <span className="muted">{v.label}</span>
  return (
    <span>
      <span className="dot" style={{ background: `var(--series-${v.winner + 1})` }} />
      <strong>{managerName(data, trade.sides[v.winner].userId)}</strong> <span className="muted">· {v.label}</span>
    </span>
  )
}

function AssetRows({ data, trade, side }: { data: Data; trade: Trade; side: TradeSide }) {
  const now = today(data)
  const i0 = snapshotIndex(data, trade.date)
  const iN = data.values.dates.length - 1
  const rows: { key: string; icon: string | null; pos: string; name: string; note?: string; v0: number; vN: number; peak: { value: number; date: string }; pts: number | null; left: string | null }[] = []

  for (const pid of side.players) {
    const series = data.values.players[pid]
    const p = data.players[pid]
    rows.push({
      key: pid,
      icon: headshot(pid),
      pos: p?.pos ?? '?',
      name: p?.name ?? pid,
      v0: series?.[i0] ?? 0,
      vN: series?.[iN] ?? 0,
      peak: peakSince(data, series, trade.date),
      pts: playerPoints(data, side, pid, now),
      left: side.tenure[pid]?.[1] ?? null,
    })
  }
  for (const key of side.picks) {
    const pick = data.values.picks[key]
    const orig = pickOriginalOwner(data, pick)
    const became = pick.playerId ? data.players[pick.playerId] : null
    const counted = pick.playerId && side.tenure[pick.playerId]
    rows.push({
      key,
      icon: null,
      pos: 'PICK',
      name: pickLabel(pick) + (became ? ` → ${became.name}` : ''),
      note: [orig !== side.userId ? `${managerName(data, orig)}'s pick` : '', pick.playerId && !counted ? 'traded away before the draft, so its value is frozen at draft day' : '']
        .filter(Boolean)
        .join(' · '),
      v0: pickSeries(data, key, side.rosterId)[i0] ?? 0,
      vN: pickSeries(data, key, side.rosterId)[iN] ?? 0,
      peak: peakSince(data, pickSeries(data, key, side.rosterId), trade.date),
      pts: counted ? playerPoints(data, side, pick.playerId!, now) : null,
      left: counted ? side.tenure[pick.playerId!][1] : null,
    })
  }

  return (
    <table className="assets">
      <thead>
        <tr>
          <th>Asset</th>
          <th className="num">At trade</th>
          <th className="num">Today</th>
          <th className="num">Peak</th>
          <th className="num">Pts for team</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.key}>
            <td>
              <div className="asset">
                {r.icon ? (
                  <img src={r.icon} alt="" loading="lazy" onError={(e) => (e.currentTarget.style.visibility = 'hidden')} />
                ) : (
                  <span className="pick-icon">PK</span>
                )}
                <span className={`pos pos-${r.pos}`}>{r.pos}</span>
                <span>
                  {r.name}
                  {(r.note || r.left) && (
                    <span className="muted small">
                      <br />
                      {[r.note, r.left ? `left team ${formatDate(r.left)}` : ''].filter(Boolean).join(' · ')}
                    </span>
                  )}
                </span>
              </div>
            </td>
            <td className="num">{r.v0.toLocaleString()}</td>
            <td className="num">{r.vN.toLocaleString()}</td>
            <td className="num">
              {r.peak.value.toLocaleString()}
              <span className="muted small">
                <br />
                {r.peak.date <= trade.date ? 'at trade' : formatDate(r.peak.date)}
              </span>
            </td>
            <td className="num">{r.pts == null ? <span className="muted">-</span> : r.pts.toFixed(1)}</td>
          </tr>
        ))}
        {side.faab > 0 && (
          <tr>
            <td colSpan={5}>
              <div className="asset">
                <span className="pick-icon">$</span>
                <span className="pos pos-FAAB">FAAB</span>
                <span>${side.faab} (not scored)</span>
              </div>
            </td>
          </tr>
        )}
      </tbody>
    </table>
  )
}

export default function TradeDetail() {
  const { id } = useParams()
  const { data, error } = useData()
  if (error) return <p className="error">{error}</p>
  if (!data) return <p className="muted">Loading…</p>
  const trade = data.trades.find((t) => t.id === id)
  if (!trade) return <p>Trade not found. <Link to="/trades">Back to all trades</Link></p>

  const r = rewind(data, trade)
  const names = trade.sides.map((s) => managerName(data, s.userId))
  const history = valueHistory(data, trade)
  const now = r.checkpoints.find((c) => c.key === 'today')!

  return (
    <>
      <Link to="/trades" className="small">
        ← All trades
      </Link>
      <h1>
        {trade.sides.map((s, i) => (
          <span key={s.rosterId}>
            {i > 0 && ' × '}
            <ManagerLink data={data} userId={s.userId} />
          </span>
        ))}
      </h1>
      <p className="muted">
        {formatDate(trade.date)} · {trade.season} {trade.week > 0 ? `week ${trade.week}` : 'offseason'}
      </p>

      <div className="hero-verdicts">
        <div>
          <span className="muted small">Winner today, by value</span>
          <VerdictText data={data} trade={trade} v={now.value} />
        </div>
        <div>
          <span className="muted small">Winner so far, by points scored</span>
          <VerdictText data={data} trade={trade} v={now.points} />
        </div>
      </div>

      <h2>Rewind</h2>
      <div className="table-scroll">
        <table className="checkpoints">
          <thead>
            <tr>
              <th>Checkpoint</th>
              {names.map((n, i) => (
                <th key={i} className="num">
                  <span className="dot" style={{ background: `var(--series-${i + 1})` }} />
                  {n}
                </th>
              ))}
              <th>Value winner</th>
              <th>Points winner</th>
            </tr>
          </thead>
          <tbody>
            {r.checkpoints.map((cp) => (
              <tr key={cp.key} className={cp.reached ? '' : 'pending'}>
                <td>
                  <strong>{cp.label}</strong>
                  <span className="muted small">
                    <br />
                    {cp.reached ? formatDate(cp.date) : cp.key === 'season' ? 'season in progress' : `on ${formatDate(cp.date)}`}
                  </span>
                </td>
                {cp.scores.map((s, i) => (
                  <td key={i} className="num">
                    {cp.reached ? (
                      <>
                        {s.value.toLocaleString()} <span className="muted small">value</span>
                        <br />
                        {s.points.toFixed(1)} <span className="muted small">pts</span>
                      </>
                    ) : (
                      <span className="muted">-</span>
                    )}
                  </td>
                ))}
                <td>{cp.reached ? <VerdictText data={data} trade={trade} v={cp.value} /> : <span className="muted">Not yet</span>}</td>
                <td>
                  {!cp.reached ? (
                    <span className="muted">Not yet</span>
                  ) : cp.key === 'trade' ? (
                    <span className="muted">-</span>
                  ) : (
                    <VerdictText data={data} trade={trade} v={cp.points} />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2>Value over time</h2>
      <ValueChart
        dates={history.dates}
        series={history.series}
        names={names}
        markers={r.checkpoints.filter((c) => c.reached && (c.key === 'season' || c.key === 'year')).map((c) => ({ date: c.date, label: c.key === 'season' ? 'Season end' : '+1 year' }))}
      />

      <h2>What each side got</h2>
      {trade.sides.map((side, i) => (
        <section key={side.rosterId} className="side-detail">
          <h3>
            <span className="dot" style={{ background: `var(--series-${i + 1})` }} />
            <ManagerLink data={data} userId={side.userId} /> got
          </h3>
          <AssetRows data={data} trade={trade} side={side} />
        </section>
      ))}

      <p className="muted small how">
        <strong>How this works.</strong> Value is the DynastyProcess superflex trade value of everything a side received,
        on that date. Picks count at a typical value for their round until the draft order is set, then at their slot, then as
        the player drafted. Points are what those players scored in this team's starting lineup after the trade, until they
        left the team. Under 10% apart counts as even.
      </p>
    </>
  )
}
