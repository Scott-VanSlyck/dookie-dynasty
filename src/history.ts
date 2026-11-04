// League history: games, standings, all-time stats, head-to-head and records.

import type { Data, Season } from './data'

export interface GameSide {
  rosterId: number
  userId: string
  points: number
}

export interface Game {
  season: string
  week: number
  playoff: boolean
  a: GameSide // the winner (or first team on a tie)
  b: GameSide
}

const ownerOf = (data: Data, season: string, rosterId: number) => data.league.rosterOwners[season]?.[rosterId] ?? ''

// Every head-to-head game played (median "games" aren't real matchups, so they aren't here).
export function allGames(data: Data): Game[] {
  const games: Game[] = []
  for (const s of data.league.seasons) {
    for (let week = 1; week <= s.lastScoredWeek; week++) {
      const rows = data.scores[s.season]?.[week] ?? []
      const byMatchup = new Map<number, typeof rows>()
      for (const r of rows) {
        if (r.matchupId == null) continue
        byMatchup.set(r.matchupId, [...(byMatchup.get(r.matchupId) ?? []), r])
      }
      for (const pair of byMatchup.values()) {
        if (pair.length !== 2) continue
        const [x, y] = pair[0].points >= pair[1].points ? pair : [pair[1], pair[0]]
        games.push({
          season: s.season,
          week,
          playoff: week >= s.playoffWeekStart,
          a: { rosterId: x.rosterId, userId: ownerOf(data, s.season, x.rosterId), points: x.points },
          b: { rosterId: y.rosterId, userId: ownerOf(data, s.season, y.rosterId), points: y.points },
        })
      }
    }
  }
  return games
}

export type Finish = 'Champion' | 'Runner-up' | '3rd place' | 'Playoffs' | null

export function finish(season: Season, rosterId: number): Finish {
  const p = season.playoffs
  // Sleeper fills in a projected bracket during the regular season; ignore it until the playoffs start.
  if (!p || (!p.complete && season.lastScoredWeek < season.playoffWeekStart)) return null
  if (p.places[1] === rosterId) return 'Champion'
  if (p.places[2] === rosterId) return 'Runner-up'
  if (p.places[3] === rosterId) return '3rd place'
  return p.teams.includes(rosterId) ? 'Playoffs' : null
}

export interface AllTimeRow {
  userId: string
  seasons: number
  wins: number
  losses: number
  ties: number
  pf: number
  maxPf: number
  titles: number
  finals: number
  playoffs: number
}

// Career totals per manager. Only finished seasons count toward titles and playoff trips.
export function allTime(data: Data): AllTimeRow[] {
  const rows = new Map<string, AllTimeRow>()
  for (const s of data.league.seasons) {
    for (const t of s.standings) {
      if (!t.userId) continue
      const r = rows.get(t.userId) ?? { userId: t.userId, seasons: 0, wins: 0, losses: 0, ties: 0, pf: 0, maxPf: 0, titles: 0, finals: 0, playoffs: 0 }
      r.seasons++
      r.wins += t.wins
      r.losses += t.losses
      r.ties += t.ties
      r.pf += t.pf
      r.maxPf += t.maxPf
      if (s.playoffs?.complete) {
        const f = finish(s, t.rosterId)
        if (f === 'Champion') r.titles++
        if (f === 'Champion' || f === 'Runner-up') r.finals++
        if (f) r.playoffs++
      }
      rows.set(t.userId, r)
    }
  }
  const pct = (r: AllTimeRow) => (r.wins + r.ties / 2) / Math.max(1, r.wins + r.losses + r.ties)
  return [...rows.values()].sort((a, b) => b.titles - a.titles || b.finals - a.finals || pct(b) - pct(a))
}

export interface H2HRow {
  opponent: string
  wins: number
  losses: number
  ties: number
  pf: number
  pa: number
}

export function headToHead(games: Game[], userId: string): H2HRow[] {
  const rows = new Map<string, H2HRow>()
  for (const g of games) {
    const me = g.a.userId === userId ? g.a : g.b.userId === userId ? g.b : null
    if (!me) continue
    const them = me === g.a ? g.b : g.a
    const r = rows.get(them.userId) ?? { opponent: them.userId, wins: 0, losses: 0, ties: 0, pf: 0, pa: 0 }
    if (me.points > them.points) r.wins++
    else if (me.points < them.points) r.losses++
    else r.ties++
    r.pf += me.points
    r.pa += them.points
    rows.set(them.userId, r)
  }
  return [...rows.values()].sort((a, b) => b.wins - b.losses - (a.wins - a.losses) || b.wins - a.wins)
}

export interface LeagueRecord {
  title: string
  value: string
  who: string // userId
  detail: string
}

export function records(data: Data, games: Game[]): LeagueRecord[] {
  const out: LeagueRecord[] = []
  const wk = (g: { season: string; week: number }) => `${g.season} week ${g.week}`
  const name = (id: string) => data.league.managers[id]?.name ?? 'Unknown'
  const max = <T,>(xs: T[], f: (x: T) => number) => xs.reduce((best, x) => (f(x) > f(best) ? x : best), xs[0])
  const min = <T,>(xs: T[], f: (x: T) => number) => xs.reduce((best, x) => (f(x) < f(best) ? x : best), xs[0])
  if (!games.length) return out

  const sides = games.flatMap((g) => [
    { ...g.a, season: g.season, week: g.week, opp: g.b },
    { ...g.b, season: g.season, week: g.week, opp: g.a },
  ])
  const regular = sides.filter((s) => {
    const season = data.league.seasons.find((x) => x.season === s.season)!
    return s.week < season.playoffWeekStart
  })

  const hi = max(sides, (s) => s.points)
  out.push({ title: 'Highest score', value: hi.points.toFixed(2), who: hi.userId, detail: `${wk(hi)} vs ${name(hi.opp.userId)}` })

  const lo = min(regular.filter((s) => s.points > 0), (s) => s.points)
  if (lo) out.push({ title: 'Lowest score', value: lo.points.toFixed(2), who: lo.userId, detail: `${wk(lo)} vs ${name(lo.opp.userId)}` })

  const blow = max(games, (g) => g.a.points - g.b.points)
  out.push({
    title: 'Biggest blowout',
    value: `+${(blow.a.points - blow.b.points).toFixed(2)}`,
    who: blow.a.userId,
    detail: `${blow.a.points.toFixed(2)}–${blow.b.points.toFixed(2)} over ${name(blow.b.userId)}, ${wk(blow)}`,
  })

  const close = min(
    games.filter((g) => g.a.points > g.b.points),
    (g) => g.a.points - g.b.points,
  )
  if (close)
    out.push({
      title: 'Closest game',
      value: `+${(close.a.points - close.b.points).toFixed(2)}`,
      who: close.a.userId,
      detail: `${close.a.points.toFixed(2)}–${close.b.points.toFixed(2)} over ${name(close.b.userId)}, ${wk(close)}`,
    })

  // Season-level records (finished seasons only, so a hot start doesn't count).
  const seasonRows = data.league.seasons
    .filter((s) => s.status === 'complete')
    .flatMap((s) => s.standings.map((t) => ({ ...t, season: s.season, games: t.wins + t.losses + t.ties })))
  if (seasonRows.length) {
    const most = max(seasonRows, (t) => t.pf)
    out.push({ title: 'Most points in a season', value: most.pf.toFixed(2), who: most.userId, detail: `${most.season} regular season` })
    const best = max(seasonRows, (t) => t.wins / Math.max(1, t.games))
    out.push({ title: 'Best record', value: `${best.wins}-${best.losses}${best.ties ? `-${best.ties}` : ''}`, who: best.userId, detail: `${best.season}, counting median games` })
    const eff = (t: (typeof seasonRows)[number]) => (t.maxPf ? t.pf / t.maxPf : 0)
    const sharp = max(seasonRows, eff)
    out.push({ title: 'Best lineup setter', value: `${(eff(sharp) * 100).toFixed(1)}%`, who: sharp.userId, detail: `${sharp.season}: points scored vs. best possible lineup` })
    const sloppy = min(seasonRows.filter((t) => t.maxPf > 0), eff)
    out.push({ title: 'Worst lineup setter', value: `${(eff(sloppy) * 100).toFixed(1)}%`, who: sloppy.userId, detail: `${sloppy.season}: points scored vs. best possible lineup` })
  }

  // Player and bench records.
  let bestPlayer = { pts: 0, pid: '', userId: '', season: '', week: 0 }
  let mostBench = { pts: 0, userId: '', season: '', week: 0 }
  for (const s of data.league.seasons) {
    for (const [week, rows] of Object.entries(data.scores[s.season] ?? {})) {
      for (const r of rows) {
        const userId = ownerOf(data, s.season, r.rosterId)
        for (const [pid, pts] of Object.entries(r.starters)) if (pts > bestPlayer.pts) bestPlayer = { pts, pid, userId, season: s.season, week: +week }
        const bench = Object.values(r.bench).reduce((a, b) => a + b, 0)
        if (bench > mostBench.pts) mostBench = { pts: bench, userId, season: s.season, week: +week }
      }
    }
  }
  if (bestPlayer.pid)
    out.push({
      title: 'Best player game',
      value: bestPlayer.pts.toFixed(2),
      who: bestPlayer.userId,
      detail: `${data.players[bestPlayer.pid]?.name ?? 'Unknown'}, ${wk(bestPlayer)}`,
    })
  if (mostBench.userId)
    out.push({ title: 'Most points left on the bench', value: mostBench.pts.toFixed(2), who: mostBench.userId, detail: wk(mostBench) })

  return out
}
