// Per-manager trade stats, built on the trade rewind scoring.

import { managerName, type Data, type Trade } from './data'
import { todayVerdicts } from './rewind'

export interface ManagerTrade {
  trade: Trade
  side: number // index of this manager's side in trade.sides
  partners: string[] // other managers' user IDs
  result: 'win' | 'loss' | 'even'
  pointsResult: 'win' | 'loss' | 'even'
  netValue: number // my value today minus the average of the other sides
  netPoints: number // same, for points scored since the trade
}

export interface ManagerStats {
  userId: string
  name: string
  avatar: string | null
  team: string | null
  seasons: string[]
  trades: ManagerTrade[]
  record: { win: number; loss: number; even: number }
  pointsRecord: { win: number; loss: number; even: number }
  netValue: number
  netPoints: number
  best: ManagerTrade | null
  worst: ManagerTrade | null
  partners: { userId: string; count: number }[]
}

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0)

export function managerTrades(data: Data, userId: string): ManagerTrade[] {
  const out: ManagerTrade[] = []
  for (const trade of data.trades) {
    const side = trade.sides.findIndex((s) => s.userId === userId)
    if (side < 0) continue
    const v = todayVerdicts(data, trade)
    const others = v.scores.filter((_, i) => i !== side)
    const outcome = (winner: number | null) => (winner == null ? 'even' : winner === side ? 'win' : 'loss')
    out.push({
      trade,
      side,
      partners: trade.sides.filter((_, i) => i !== side).map((s) => s.userId ?? ''),
      result: outcome(v.value.winner),
      pointsResult: outcome(v.points.winner),
      netValue: Math.round(v.scores[side].value - avg(others.map((s) => s.value))),
      netPoints: Math.round((v.scores[side].points - avg(others.map((s) => s.points))) * 10) / 10,
    })
  }
  return out
}

export function managerStats(data: Data, userId: string): ManagerStats {
  const trades = managerTrades(data, userId)
  const tally = (key: 'result' | 'pointsResult') => {
    const r = { win: 0, loss: 0, even: 0 }
    for (const t of trades) r[t[key]]++
    return r
  }
  const byNet = [...trades].sort((a, b) => b.netValue - a.netValue)
  const partnerCounts = new Map<string, number>()
  for (const t of trades) for (const p of t.partners) partnerCounts.set(p, (partnerCounts.get(p) ?? 0) + 1)
  const m = data.league.managers[userId]

  return {
    userId,
    name: managerName(data, userId),
    avatar: m?.avatar ?? null,
    team: m?.team ?? null,
    seasons: data.league.seasons.map((s) => s.season).filter((s) => Object.values(data.league.rosterOwners[s] ?? {}).includes(userId)),
    trades,
    record: tally('result'),
    pointsRecord: tally('pointsResult'),
    netValue: trades.reduce((a, t) => a + t.netValue, 0),
    netPoints: Math.round(trades.reduce((a, t) => a + t.netPoints, 0) * 10) / 10,
    best: byNet[0] && byNet[0].netValue > 0 ? byNet[0] : null,
    worst: byNet.at(-1) && byNet.at(-1)!.netValue < 0 ? byNet.at(-1)! : null,
    partners: [...partnerCounts].map(([id, count]) => ({ userId: id, count })).sort((a, b) => b.count - a.count),
  }
}

// Everyone who has managed a team in any season.
export function allManagerIds(data: Data) {
  const ids = new Set<string>()
  for (const owners of Object.values(data.league.rosterOwners)) for (const id of Object.values(owners)) if (id) ids.add(id)
  return [...ids]
}

export const signed = (n: number, digits = 0) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(n).toLocaleString(undefined, { maximumFractionDigits: digits, minimumFractionDigits: digits })}`
