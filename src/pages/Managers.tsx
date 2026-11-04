import { useMemo } from 'react'
import { useNavigate } from 'react-router'
import ManagerLink, { Avatar } from '../components/ManagerLink'
import { managerName, useData } from '../data'
import { allManagerIds, managerStats, signed } from '../managers'

export default function Managers() {
  const { data, error } = useData()
  const navigate = useNavigate()
  const rows = useMemo(() => {
    if (!data) return []
    return allManagerIds(data)
      .map((id) => managerStats(data, id))
      .sort((a, b) => b.netValue - a.netValue)
  }, [data])

  if (error) return <p className="error">{error}</p>
  if (!data) return <p className="muted">Loading…</p>

  return (
    <>
      <h1>Managers</h1>
      <p className="muted">Who wins their trades? Ranked by total value gained from trading, as of today.</p>
      <div className="table-scroll">
        <table className="leaderboard">
          <thead>
            <tr>
              <th>#</th>
              <th>Manager</th>
              <th className="num">Trades</th>
              <th className="num" title="Wins, losses and even trades by value today">Record (value)</th>
              <th className="num" title="Wins, losses and even trades by points scored since the trade">Record (points)</th>
              <th className="num" title="Sum over every trade of: value received minus value given, as of today">Net value</th>
              <th className="num" title="Sum over every trade of: points scored by what you got minus points scored by what you gave">Net points</th>
              <th>Top partner</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((m, i) => (
              <tr key={m.userId} className="clickable" onClick={() => navigate(`/managers/${m.userId}`)}>
                <td className="muted">{i + 1}</td>
                <td>
                  <div className="asset">
                    <Avatar src={m.avatar} />
                    <span>
                      <ManagerLink data={data} userId={m.userId} />
                      {m.team && <span className="muted small"><br />{m.team}</span>}
                    </span>
                  </div>
                </td>
                <td className="num">{m.trades.length}</td>
                <td className="num">
                  {m.record.win}-{m.record.loss}-{m.record.even}
                </td>
                <td className="num">
                  {m.pointsRecord.win}-{m.pointsRecord.loss}-{m.pointsRecord.even}
                </td>
                <td className={`num ${m.netValue > 0 ? 'gain' : m.netValue < 0 ? 'drop' : ''}`}>{signed(m.netValue)}</td>
                <td className={`num ${m.netPoints > 0 ? 'gain' : m.netPoints < 0 ? 'drop' : ''}`}>{signed(m.netPoints, 1)}</td>
                <td className="small">
                  {m.partners[0] ? (
                    <>
                      {managerName(data, m.partners[0].userId)} <span className="muted">({m.partners[0].count})</span>
                    </>
                  ) : (
                    <span className="muted">-</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="muted small how">
        Records are win-loss-even. A trade is even when both sides are within 10% of each other, or when one side only got FAAB.
        Net value adds up, for every trade, the value of what this manager received minus what they gave (in 3-team trades, the
        average of the other sides).
      </p>
    </>
  )
}
