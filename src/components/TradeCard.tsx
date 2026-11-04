import { Link } from 'react-router'
import { formatDate, headshot, managerName, pickLabel, pickOriginalOwner, type Data, type Trade } from '../data'
import { fcVerdict, todayVerdicts, type Verdict } from '../rewind'
import ManagerLink from './ManagerLink'

function Pill({ data, trade, v, what }: { data: Data; trade: Trade; v: Verdict; what: string }) {
  return (
    <span className="pill">
      <span className="muted">{what}:</span>{' '}
      {v.winner == null ? (
        v.label
      ) : (
        <>
          <strong>{managerName(data, trade.sides[v.winner].userId)}</strong>{' '}
          <span className="muted">
            ({v.label.toLowerCase()}, +{Math.round(v.gap).toLocaleString()}
            {what.startsWith('Points') ? ' pts' : ''})
          </span>
        </>
      )}
    </span>
  )
}

export default function TradeCard({ data, trade }: { data: Data; trade: Trade }) {
  const v = todayVerdicts(data, trade)
  const fc = fcVerdict(data, trade)
  return (
    <article className="trade">
      <header>
        <span>{formatDate(trade.date)}</span>
        <span className="muted">
          {trade.season} · {trade.week > 0 ? `Week ${trade.week}` : 'Offseason'}
        </span>
      </header>
      <Link to={`/trades/${trade.id}`} className="verdict-strip">
        <Pill data={data} trade={trade} v={v.value} what="KTC" />
        {fc && <Pill data={data} trade={trade} v={fc} what="FantasyCalc" />}
        <Pill data={data} trade={trade} v={v.points} what="Points so far" />
        <span className="rewind-link">Rewind →</span>
      </Link>
      <div className={`sides sides-${trade.sides.length}`}>
        {trade.sides.map((side) => (
          <section key={side.rosterId} className="side">
            <h3>
              <ManagerLink data={data} userId={side.userId} /> <span className="muted">gets</span>
            </h3>
            <ul>
              {side.players.map((pid) => {
                const p = data.players[pid]
                return (
                  <li key={pid}>
                    <img src={headshot(pid)} alt="" loading="lazy" onError={(e) => (e.currentTarget.style.visibility = 'hidden')} />
                    <span className={`pos pos-${p?.pos ?? 'NA'}`}>{p?.pos ?? '?'}</span>
                    <span>{p?.name ?? pid}</span>
                  </li>
                )
              })}
              {side.picks.map((key) => {
                const pick = data.values.picks[key]
                const orig = pickOriginalOwner(data, pick)
                const drafted = pick.playerId ? data.players[pick.playerId] : null
                return (
                  <li key={key}>
                    <span className="pick-icon">PK</span>
                    <span className="pos pos-PICK">PICK</span>
                    <span>
                      {pickLabel(pick)}
                      {orig !== side.userId && <span className="muted small"> · {managerName(data, orig)}'s</span>}
                      {drafted && <span className="became"> → {drafted.name}</span>}
                    </span>
                  </li>
                )
              })}
              {side.faab > 0 && (
                <li>
                  <span className="pick-icon">$</span>
                  <span className="pos pos-FAAB">FAAB</span>
                  <span>${side.faab}</span>
                </li>
              )}
              {side.players.length === 0 && side.picks.length === 0 && side.faab <= 0 && <li className="muted">Nothing</li>}
            </ul>
          </section>
        ))}
      </div>
    </article>
  )
}
