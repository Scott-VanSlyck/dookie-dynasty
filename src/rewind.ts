// Trade rewind scoring: what each side of a trade was worth, and what it produced,
// at a series of checkpoints after the trade.

import type { Data, Trade, TradeSide } from './data'

export type CheckpointKey = 'trade' | 'season' | 'year' | 'today'

export interface Checkpoint {
  key: CheckpointKey
  label: string
  date: string
  reached: boolean
}

export interface SideScore {
  value: number // superflex trade value of everything received, on the checkpoint date
  points: number // starter points those players scored for this team, trade -> checkpoint
}

export interface Verdict {
  winner: number | null // index into trade.sides, null when it's too close to call
  margin: number // 0..1, share of the bigger side's total
  gap: number // winner's total minus the runner-up's
  label: string
}

const DAY = 86400000
const addDays = (iso: string, days: number) => new Date(Date.parse(iso) + days * DAY).toISOString().slice(0, 10)

// The date the data was last refreshed, in the viewer's local time zone (YYYY-MM-DD).
export const today = (data: Data) => new Date(data.league.builtAt).toLocaleDateString('en-CA')

// Last day of the season the trade belongs to (or the next one, for trades made after the championship).
function seasonEnd(data: Data, trade: Trade): { season: string; date: string | null } {
  const seasons = data.league.seasons
  for (const s of seasons.filter((s) => s.season >= trade.season)) {
    const last = s.weekDates[String(s.lastScoredWeek)]
    if (s.status !== 'complete') return { season: s.season, date: null }
    if (last && last >= trade.date) return { season: s.season, date: last }
  }
  return { season: seasons.at(-1)!.season, date: null }
}

export function checkpoints(data: Data, trade: Trade): Checkpoint[] {
  const now = today(data)
  const end = seasonEnd(data, trade)
  const yearLater = addDays(trade.date, 365)
  return [
    { key: 'trade', label: 'Day of trade', date: trade.date, reached: true },
    {
      key: 'season',
      label: `End of ${end.season} season`,
      date: end.date ?? now,
      reached: end.date != null && end.date <= now,
    },
    { key: 'year', label: '1 year later', date: yearLater, reached: yearLater <= now },
    { key: 'today', label: 'Today', date: now, reached: true },
  ]
}

// Index of the latest value snapshot on or before a date (-1 if before all snapshots).
export function snapshotIndex(data: Data, date: string) {
  const dates = data.values.dates
  let lo = 0
  let hi = dates.length - 1
  let ans = -1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (dates[mid] <= date) (ans = mid), (lo = mid + 1)
    else hi = mid - 1
  }
  return ans
}

export function playerValueAt(data: Data, pid: string, i: number) {
  return i < 0 ? 0 : data.values.players[pid]?.[i] ?? 0
}

export function pickValueAt(data: Data, key: string, i: number) {
  return i < 0 ? 0 : data.values.picks[key]?.values[i] ?? 0
}

export function sideValueAt(data: Data, side: TradeSide, i: number) {
  let total = 0
  for (const pid of side.players) total += playerValueAt(data, pid, i)
  for (const key of side.picks) total += pickValueAt(data, key, i)
  return total
}

// Starter points a player scored for this side's team while they kept him, up to `until`.
export function playerPoints(data: Data, side: TradeSide, pid: string, until: string) {
  const tenure = side.tenure[pid]
  if (!tenure) return 0
  const [from, left] = tenure
  const end = left && left < until ? left : until
  let total = 0
  for (const s of data.league.seasons) {
    for (const [week, weekDate] of Object.entries(s.weekDates)) {
      if (weekDate <= from || weekDate > end) continue
      const row = data.scores[s.season]?.[week]?.find((r) => r.rosterId === side.rosterId)
      total += row?.starters[pid] ?? 0
    }
  }
  return total
}

// Players whose points count for a side: the players received, plus whoever its picks became.
export function producingPlayers(side: TradeSide) {
  return Object.keys(side.tenure)
}

export function sideScore(data: Data, side: TradeSide, date: string): SideScore {
  const i = snapshotIndex(data, date)
  const points = producingPlayers(side).reduce((sum, pid) => sum + playerPoints(data, side, pid, date), 0)
  return { value: sideValueAt(data, side, i), points: Math.round(points * 10) / 10 }
}

// A side that only received FAAB can't be scored (FAAB has no trade value), so no winner is named.
const faabOnly = (trade: Trade) => trade.sides.some((s) => s.players.length === 0 && s.picks.length === 0)

export function verdict(totals: number[], kind: 'value' | 'points', trade?: Trade): Verdict {
  if (trade && faabOnly(trade)) return { winner: null, margin: 0, gap: 0, label: 'FAAB deal' }
  const order = totals.map((v, i) => [v, i]).sort((a, b) => b[0] - a[0])
  const [best, second] = order
  if (!best || best[0] <= 0) return { winner: null, margin: 0, gap: 0, label: kind === 'points' ? 'No points yet' : 'No value' }
  const gap = best[0] - (second?.[0] ?? 0)
  const margin = gap / best[0]
  if (margin < 0.1) return { winner: null, margin, gap, label: 'Even' }
  const label = margin < 0.25 ? 'Slight edge' : margin < 0.5 ? 'Clear win' : margin < 0.75 ? 'Big win' : 'Fleeced'
  return { winner: best[1], margin, gap, label }
}

export interface TradeRewind {
  checkpoints: (Checkpoint & { scores: SideScore[]; value: Verdict; points: Verdict })[]
}

export function rewind(data: Data, trade: Trade): TradeRewind {
  return {
    checkpoints: checkpoints(data, trade).map((cp) => {
      const scores = trade.sides.map((s) => sideScore(data, s, cp.date))
      return {
        ...cp,
        scores,
        value: verdict(scores.map((s) => s.value), 'value', trade),
        points: verdict(scores.map((s) => s.points), 'points', trade),
      }
    }),
  }
}

// Just today's verdicts, for the trade list.
export function todayVerdicts(data: Data, trade: Trade) {
  const now = today(data)
  const scores = trade.sides.map((s) => sideScore(data, s, now))
  return { scores, value: verdict(scores.map((s) => s.value), 'value', trade), points: verdict(scores.map((s) => s.points), 'points', trade) }
}

// Highest value an asset reached after the trade, and when.
export function peakSince(data: Data, series: number[] | undefined, fromDate: string) {
  if (!series) return { value: 0, date: fromDate }
  let best = 0
  let at = fromDate
  for (let i = Math.max(0, snapshotIndex(data, fromDate)); i < series.length; i++) {
    if (series[i] > best) (best = series[i]), (at = data.values.dates[i])
  }
  return { value: best, date: at }
}

// Each side's total value at every snapshot from the trade to today (for the chart).
export function valueHistory(data: Data, trade: Trade) {
  const start = Math.max(0, snapshotIndex(data, trade.date))
  const dates = data.values.dates.slice(start)
  return {
    dates,
    series: trade.sides.map((side) => dates.map((_, j) => sideValueAt(data, side, start + j))),
  }
}
