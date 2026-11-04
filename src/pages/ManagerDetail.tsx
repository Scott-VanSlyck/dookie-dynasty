import { useMemo } from 'react'
import { Link, useParams } from 'react-router'
import ManagerLink, { Avatar } from '../components/ManagerLink'
import { formatDate, pickLabel, useData, type Data, type TradeSide } from '../data'
import { allManagerIds, managerStats, signed, type ManagerTrade } from '../managers'

// Short text list of what a side received: players, and picks (with who they became).
function assetList(data: Data, side: TradeSide) {
  const items = side.players.map((pid) => data.players[pid]?.name ?? pid)
  for (const key of side.picks) {
    const pick = data.values.picks[key]
    const became = pick.playerId ? data.players[pick.playerId]?.name : null
    items.push(pickLabel(pick) + (became ? ` (${became})` : ''))
  }
  if (side.faab > 0) items.push(`$${side.faab} FAAB`)
  return items.length ? items.join(', ') : 'nothing'
}

const RESULT_LABEL = { win: 'Won', loss: 'Lost', even: 'Even' }

function TradeRow({ data, t }: { data: Data; t: ManagerTrade }) {
  const mine = t.trade.sides[t.side]
  const gave = t.trade.sides.filter((_, i) => i !== t.side)
  return (
    <Link to={`/trades/${t.trade.id}`} className="trade-row">
      <span className={`result result-${t.result}`}>{RESULT_LABEL[t.result]}</span>
      <span className="trade-row-body">
        <span className="muted small">
          {formatDate(t.trade.date)} · with {gave.map((s) => data.league.managers[s.userId ?? '']?.name ?? 'Unknown').join(' & ')}
        </span>
        <span>
          <span className="muted">Got</span> {assetList(data, mine)}
        </span>
        <span>
          <span className="muted">Gave</span> {gave.map((s) => assetList(data, s)).join(' + ')}
        </span>
      </span>
      <span className="trade-row-nums">
        <span className={t.netValue > 0 ? 'gain' : t.netValue < 0 ? 'drop' : ''}>{signed(t.netValue)}</span>
        <span className="muted small">value</span>
        <span className={t.netPoints > 0 ? 'gain' : t.netPoints < 0 ? 'drop' : ''}>{signed(t.netPoints, 1)}</span>
        <span className="muted small">pts</span>
      </span>
    </Link>
  )
}

export default function ManagerDetail() {
  const { id } = useParams()
  const { data, error } = useData()
  const stats = useMemo(() => (data && id && allManagerIds(data).includes(id) ? managerStats(data, id) : null), [data, id])

  if (error) return <p className="error">{error}</p>
  if (!data) return <p className="muted">Loading…</p>
  if (!stats) return <p>Manager not found. <Link to="/managers">All managers</Link></p>

  const newestFirst = [...stats.trades].reverse()
  return (
    <>
      <Link to="/managers" className="small">
        ← All managers
      </Link>
      <div className="manager-header">
        <Avatar src={stats.avatar} size={64} />
        <div>
          <h1>{stats.name}</h1>
          <p className="muted">
            {stats.team ? `${stats.team} · ` : ''}
            {stats.seasons.length === 1 ? `${stats.seasons[0]} season` : `${stats.seasons[0]}–${stats.seasons.at(-1)} seasons`}
          </p>
        </div>
      </div>

      <div className="tiles">
        <div>
          <span className="muted small">Trades</span>
          <strong>{stats.trades.length}</strong>
        </div>
        <div>
          <span className="muted small">Record by value</span>
          <strong>
            {stats.record.win}-{stats.record.loss}-{stats.record.even}
          </strong>
        </div>
        <div>
          <span className="muted small">Net value today</span>
          <strong className={stats.netValue > 0 ? 'gain' : stats.netValue < 0 ? 'drop' : ''}>{signed(stats.netValue)}</strong>
        </div>
        <div>
          <span className="muted small">Record by points</span>
          <strong>
            {stats.pointsRecord.win}-{stats.pointsRecord.loss}-{stats.pointsRecord.even}
          </strong>
        </div>
        <div>
          <span className="muted small">Net points</span>
          <strong className={stats.netPoints > 0 ? 'gain' : stats.netPoints < 0 ? 'drop' : ''}>{signed(stats.netPoints, 1)}</strong>
        </div>
      </div>

      {(stats.best || stats.worst) && (
        <div className="best-worst">
          {stats.best && (
            <section>
              <h2>Best trade</h2>
              <TradeRow data={data} t={stats.best} />
            </section>
          )}
          {stats.worst && (
            <section>
              <h2>Worst trade</h2>
              <TradeRow data={data} t={stats.worst} />
            </section>
          )}
        </div>
      )}

      {stats.partners.length > 0 && (
        <>
          <h2>Trade partners</h2>
          <div className="partners">
            {stats.partners.map((p) => (
              <span key={p.userId} className="chip">
                <ManagerLink data={data} userId={p.userId} /> <span className="muted">×{p.count}</span>
              </span>
            ))}
          </div>
        </>
      )}

      <h2>All trades</h2>
      {newestFirst.length === 0 ? (
        <p className="muted">No trades yet.</p>
      ) : (
        <div className="trade-rows">
          {newestFirst.map((t) => (
            <TradeRow key={t.trade.id} data={data} t={t} />
          ))}
        </div>
      )}
    </>
  )
}
