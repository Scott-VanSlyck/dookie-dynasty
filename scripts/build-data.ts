// Turns data/raw/ into the small, clean JSON files the website reads (public/data/).
//   node scripts/build-data.ts
//
// Output files:
//   league.json  - seasons, managers, which manager owned each roster each season, week dates
//   trades.json  - every completed trade, split into what each team received
//   players.json - name/position/team for every player the other files mention
//   values.json  - weekly superflex trade value history for every traded asset
//   scores.json  - weekly points for every roster (starters and bench), every season

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(import.meta.dirname, '..')
const RAW = join(ROOT, 'data', 'raw')
const OUT = join(ROOT, 'public', 'data')

const load = (path: string) => JSON.parse(readFileSync(join(RAW, path), 'utf8'))
const write = (name: string, data: unknown) => {
  mkdirSync(OUT, { recursive: true })
  const text = JSON.stringify(data)
  writeFileSync(join(OUT, name), text)
  console.log(`  ${name.padEnd(13)} ${(text.length / 1024).toFixed(0).padStart(5)} KB`)
}

function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') field += '"', i++
      else if (ch === '"') quoted = false
      else field += ch
    } else if (ch === '"') quoted = true
    else if (ch === ',') row.push(field), (field = '')
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++
      row.push(field), rows.push(row), (row = []), (field = '')
    } else field += ch
  }
  if (field || row.length) row.push(field), rows.push(row)
  const [header, ...body] = rows
  return body.filter((r) => r.length === header.length).map((r) => Object.fromEntries(header.map((h, i) => [h, r[i]])))
}

const ordinal = (n: number) => `${n}${n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th'}`
const isoDate = (ms: number) => new Date(ms).toISOString().slice(0, 10)
const normName = (s: string) =>
  s.toLowerCase().replace(/\b(jr|sr|ii|iii|iv|v)\b\.?/g, '').replace(/[^a-z]/g, '')

// NFL week 1 kicks off the Thursday after Labor Day (first Monday of September).
// A week is "final" on the Tuesday after its games.
function weekFinalDate(season: number, week: number) {
  const sept1 = new Date(Date.UTC(season, 8, 1))
  const laborDay = 1 + ((8 - sept1.getUTCDay()) % 7)
  const kickoff = Date.UTC(season, 8, laborDay + 3)
  return isoDate(kickoff + ((week - 1) * 7 + 5) * 86400000)
}

// ---------- Sleeper: seasons, managers, rosters ----------

console.log('Building site data...')
const seasonList: string[] = load('sleeper/seasons.json')
const sleeperPlayers: Record<string, { name: string; pos: string; team: string }> = load('sleeper/players.json')

const managers: Record<string, { name: string; team: string | null; avatar: string | null }> = {}
const rosterOwners: Record<string, Record<number, string>> = {}
const seasons: any[] = []
const raw: Record<string, any> = {}

for (const season of seasonList) {
  const r = {
    league: load(`sleeper/${season}/league.json`),
    users: load(`sleeper/${season}/users.json`),
    rosters: load(`sleeper/${season}/rosters.json`),
    drafts: load(`sleeper/${season}/drafts.json`),
    draftPicks: load(`sleeper/${season}/draft_picks.json`),
    transactions: load(`sleeper/${season}/transactions.json`),
    matchups: load(`sleeper/${season}/matchups.json`),
  }
  raw[season] = r

  // Later seasons overwrite earlier ones, so names are the most recent.
  for (const u of r.users) {
    managers[u.user_id] = {
      name: u.display_name,
      team: u.metadata?.team_name ?? null,
      avatar: u.metadata?.avatar ?? (u.avatar ? `https://sleepercdn.com/avatars/thumbs/${u.avatar}` : null),
    }
  }
  rosterOwners[season] = Object.fromEntries(r.rosters.map((ro: any) => [ro.roster_id, ro.owner_id]))

  const s = r.league.settings
  const lastWeek = r.league.status === 'complete' ? s.last_scored_leg ?? 17 : s.last_scored_leg ?? 0
  const rookieDraft = r.drafts.find((d: any) => d.status === 'complete' || d.status === 'pre_draft' || d.status === 'drafting')
  seasons.push({
    season,
    leagueId: r.league.league_id,
    status: r.league.status,
    lastScoredWeek: lastWeek,
    playoffWeekStart: s.playoff_week_start,
    weekDates: Object.fromEntries(Array.from({ length: lastWeek }, (_, i) => [i + 1, weekFinalDate(+season, i + 1)])),
    draft: rookieDraft
      ? { id: rookieDraft.draft_id, type: rookieDraft.type, rounds: rookieDraft.settings.rounds, date: rookieDraft.start_time ? isoDate(rookieDraft.start_time) : null }
      : null,
    standings: buildStandings(r),
    playoffs: buildPlayoffs(load(`sleeper/${season}/winners_bracket.json`)),
  })
}

// Regular-season standings exactly as Sleeper reports them. This league also plays the
// weekly median, so a 14-week season has 28 "games".
function buildStandings(r: any) {
  const teamName = new Map(r.users.map((u: any) => [u.user_id, u.metadata?.team_name ?? null]))
  const pts = (whole: number, dec: number) => Math.round(((whole ?? 0) + (dec ?? 0) / 100) * 100) / 100
  return r.rosters
    .map((ro: any) => {
      const st = ro.settings ?? {}
      return {
        rosterId: ro.roster_id,
        userId: ro.owner_id,
        teamName: teamName.get(ro.owner_id) ?? null,
        wins: st.wins ?? 0,
        losses: st.losses ?? 0,
        ties: st.ties ?? 0,
        pf: pts(st.fpts, st.fpts_decimal),
        pa: pts(st.fpts_against, st.fpts_against_decimal),
        maxPf: pts(st.ppts, st.ppts_decimal), // best possible lineup every week
      }
    })
    .sort((a: any, b: any) => b.wins - a.wins || b.pf - a.pf)
}

// Final places from the winners bracket (matches with "p" decide that place), plus who made the playoffs.
function buildPlayoffs(bracket: any[]) {
  if (!bracket?.length) return null
  const places: Record<number, number> = {}
  for (const m of bracket) {
    if (m.p && m.w && m.l) {
      places[m.p] = m.w
      places[m.p + 1] = m.l
    }
  }
  const teams = [...new Set(bracket.flatMap((m) => [m.t1, m.t2]).filter((t) => typeof t === 'number'))]
  return { teams, places, complete: places[1] != null }
}

// ---------- Draft pick resolution ----------
// A traded pick is identified by (season, round, original roster). Sleeper's draft order gives a
// *projected* slot, but this league runs a draft lottery and swaps picks on draft day, so the slot
// a pick ends up at (and the player taken with it) comes from the draft results themselves:
// the team that owned the pick going into the draft is matched to a pick it actually made.

// Projected slot from Sleeper's draft order (pre-lottery).
function pickSlot(season: string, origRosterId: number): number | null {
  const r = raw[season]
  const draft = r?.drafts?.[0]
  if (!draft) return null
  if (draft.slot_to_roster_id) {
    const hit = Object.entries(draft.slot_to_roster_id).find(([, rid]) => rid === origRosterId)
    if (hit) return +hit[0]
  }
  const owner = rosterOwners[season]?.[origRosterId]
  return owner && draft.draft_order?.[owner] ? draft.draft_order[owner] : null
}

interface DraftedPick {
  player_id: string
  roster_id: number // team that actually made the pick
  draft_slot: number
}

const allTradesByTime = seasonList
  .flatMap((s) => raw[s].transactions)
  .filter((t: any) => t.type === 'trade' && t.status === 'complete')
  .sort((a: any, b: any) => (a.status_updated ?? a.created) - (b.status_updated ?? b.created))

const draftResolution = new Map<string, Map<string, DraftedPick>>() // season -> "round-origRoster" -> pick made

function resolveDraft(season: string): Map<string, DraftedPick> {
  if (draftResolution.has(season)) return draftResolution.get(season)!
  const result = new Map<string, DraftedPick>()
  draftResolution.set(season, result)
  const r = raw[season]
  const draft = r?.drafts?.[0]
  if (!draft || draft.status !== 'complete') return result
  const picks: any[] = (r.draftPicks[draft.draft_id] ?? []).filter((p: any) => p.player_id)

  // Who owned each pick going into the draft, from every league trade before draft day.
  const owner = new Map<string, number>()
  for (const t of allTradesByTime) {
    if ((t.status_updated ?? t.created) >= draft.start_time) break
    for (const p of t.draft_picks ?? []) if (p.season === season) owner.set(`${p.round}-${p.roster_id}`, p.owner_id)
  }

  const rounds = [...new Set(picks.map((p) => p.round))]
  const origs: number[] = r.rosters.map((ro: any) => ro.roster_id)
  for (const round of rounds) {
    const open = picks.filter((p) => p.round === round).sort((a, b) => a.draft_slot - b.draft_slot)
    const keys = origs
      .map((orig) => ({ key: `${round}-${orig}`, owner: owner.get(`${round}-${orig}`) ?? orig, proj: pickSlot(season, orig) ?? 99 }))
      .sort((a, b) => a.proj - b.proj)
    const take = (k: (typeof keys)[number], match: (p: any) => boolean) => {
      const i = open.findIndex(match)
      if (i < 0) return false
      result.set(k.key, open[i])
      open.splice(i, 1)
      return true
    }
    // 1) owner picked at the projected slot; 2) owner picked somewhere else (lottery);
    // 3) anything left (picks moved during the draft itself) by projected order.
    let rest = keys.filter((k) => !take(k, (p) => p.roster_id === k.owner && p.draft_slot === k.proj))
    rest = rest.filter((k) => !take(k, (p) => p.roster_id === k.owner))
    rest.forEach((k) => take(k, () => true))
  }
  return result
}

function draftedPlayer(season: string, round: number, origRosterId: number): DraftedPick | null {
  return resolveDraft(season).get(`${round}-${origRosterId}`) ?? null
}

// ---------- Trades ----------

const trades: any[] = []
interface PickAsset {
  season: string
  round: number
  orig: number
  projSlot: number | null
  slot: number | null
  playerId: string | null
  draftedBy: number | null
  draftDate: string | null
}
const pickAssets = new Map<string, PickAsset>()
const referencedPlayers = new Set<string>()

for (const season of seasonList) {
  for (const tx of raw[season].transactions) {
    if (tx.type !== 'trade' || tx.status !== 'complete') continue
    const sides = (tx.roster_ids as number[]).map((rid) => ({
      rosterId: rid,
      userId: rosterOwners[season][rid] ?? null,
      players: Object.entries(tx.adds ?? {}).filter(([, to]) => to === rid).map(([pid]) => pid),
      picks: [] as string[],
      faab: 0,
    }))
    const side = (rid: number) => sides.find((s) => s.rosterId === rid)!

    for (const p of tx.draft_picks ?? []) {
      const key = `${p.season}-${p.round}-${p.roster_id}`
      if (!pickAssets.has(key)) {
        const projSlot = pickSlot(p.season, p.roster_id)
        const drafted = draftedPlayer(p.season, p.round, p.roster_id)
        const playerId = drafted?.player_id ?? null
        const draft = seasons.find((s) => s.season === p.season)?.draft
        pickAssets.set(key, {
          season: p.season,
          round: p.round,
          orig: p.roster_id,
          projSlot,
          slot: drafted?.draft_slot ?? null, // actual slot, known after the draft
          draftedBy: drafted?.roster_id ?? null,
          playerId,
          draftDate: playerId ? draft?.date ?? null : null,
        })
        if (playerId) referencedPlayers.add(playerId)
      }
      side(p.owner_id)?.picks.push(key)
    }
    for (const w of tx.waiver_budget ?? []) {
      side(w.receiver).faab += w.amount
      side(w.sender).faab -= w.amount
    }
    sides.forEach((s) => s.players.forEach((pid) => referencedPlayers.add(pid)))

    trades.push({
      id: tx.transaction_id,
      season,
      week: tx.leg,
      date: isoDate(tx.status_updated ?? tx.created),
      ms: tx.status_updated ?? tx.created,
      sides,
    })
  }
}
trades.sort((a, b) => a.ms - b.ms)

// ---------- Tenure: how long each team kept what it received ----------
// Every time a player leaves a roster (traded, dropped, released), Sleeper records a "drop".
// A side's production only counts while the player stays on that roster.

const departures = new Map<string, number[]>() // "rosterId|playerId" -> times the player left
for (const season of seasonList) {
  for (const tx of raw[season].transactions) {
    if (tx.status !== 'complete') continue
    for (const [pid, rid] of Object.entries<number>(tx.drops ?? {})) {
      const key = `${rid}|${pid}`
      if (!departures.has(key)) departures.set(key, [])
      departures.get(key)!.push(tx.status_updated ?? tx.created)
    }
  }
}
const leftAt = (rid: number, pid: string, after: number) => {
  const times = (departures.get(`${rid}|${pid}`) ?? []).filter((t) => t > after).sort((a, b) => a - b)
  return times.length ? isoDate(times[0]) : null
}

for (const t of trades) {
  for (const s of t.sides) {
    const tenure: Record<string, [string, string | null]> = {}
    for (const pid of s.players) tenure[pid] = [t.date, leftAt(s.rosterId, pid, t.ms)]
    // A received pick produces points only if this team still had it on draft day.
    for (const key of s.picks) {
      const a = pickAssets.get(key)!
      if (a.playerId && a.draftDate && a.draftedBy === s.rosterId) {
        tenure[a.playerId] = [a.draftDate, leftAt(s.rosterId, a.playerId, Date.parse(a.draftDate))]
      }
    }
    s.tenure = tenure
  }
  delete t.ms
}

// ---------- Value history (DynastyProcess, superflex) ----------

const idMap = new Map<string, string>() // fantasypros id -> sleeper id
for (const row of parseCsv(readFileSync(join(RAW, 'dp', 'db_playerids.csv'), 'utf8'))) {
  if (row.fantasypros_id && row.sleeper_id && row.fantasypros_id !== 'NA' && row.sleeper_id !== 'NA') idMap.set(row.fantasypros_id, row.sleeper_id)
}
const byName = new Map<string, string>()
for (const [pid, p] of Object.entries(sleeperPlayers)) if (p.name && p.pos) byName.set(`${normName(p.name)}|${p.pos}`, pid)

const snapshots: { date: string }[] = load('dp/snapshots.json')
const dates = snapshots.map((s) => s.date).filter((d) => existsSync(join(RAW, 'dp', 'values', `${d}.csv`)))
const playerSeries: Record<string, number[]> = {}
const pickTables: Map<string, number>[] = []
const valuedPlayers = new Set<string>()

dates.forEach((date, i) => {
  const picks = new Map<string, number>()
  for (const row of parseCsv(readFileSync(join(RAW, 'dp', 'values', `${date}.csv`), 'utf8'))) {
    const value = Math.round(+row.value_2qb || 0)
    if (row.pos === 'PICK') {
      picks.set(row.player, value)
      continue
    }
    const pid = idMap.get(row.fp_id) ?? byName.get(`${normName(row.player)}|${row.pos}`)
    if (!pid || !referencedPlayers.has(pid)) continue
    valuedPlayers.add(pid)
    ;(playerSeries[pid] ??= new Array(dates.length).fill(0))[i] = value
  }
  pickTables.push(picks)
})

// TE premium: this league scores TEs at 1.5 PPR (+0.5 over WRs), which is KeepTradeCut's "TE+" tier.
// Neither DynastyProcess nor FantasyCalc includes a TE premium, so we add the same boost KTC applies.
// KTC doesn't publish its formula; this curve was measured from its superflex TE values in Nov 2026
// (base vs. TE+): about +350 for most TEs, growing to about +870 for the very best.
//   ~8,150 → +11% | ~5,000 → +12% | ~3,000 → +15% | ~2,000 → +20% | ~1,000 → +37% | ~500 → +72%
// Below 500 (TEs KTC doesn't even list) the boost shrinks in proportion, so worthless TEs stay near zero.
function tePremiumBoost(value: number) {
  if (value <= 0) return 0
  if (value < 500) return value * 0.69
  if (value <= 3000) return 340 + 0.025 * value
  return 415 + 0.088 * (value - 3000)
}
const withTePremium = (pid: string, series: number[]) =>
  sleeperPlayers[pid]?.pos === 'TE' ? series.map((v) => Math.round(v + tePremiumBoost(v))) : series
for (const pid of Object.keys(playerSeries)) playerSeries[pid] = withTePremium(pid, playerSeries[pid])

// DynastyProcess has short-lived glitches (e.g. 2nd-round picks worth ~5x for most of February 2025,
// or a player missing from one week's file). Replace any value more than 2x away from the median of the
// surrounding 13 weeks. Real moves persist, so they win the median and are kept; the latest few weeks
// (with no "after" to compare against) are left alone.
function smooth(series: number[]) {
  return series.map((v, i) => {
    if (i < 3 || i > series.length - 4) return v
    const around = [...series.slice(Math.max(0, i - 6), i), ...series.slice(i + 1, i + 7)].sort((a, b) => a - b)
    const median = around[around.length >> 1]
    return median >= 50 && (v > 2 * median || v < median / 2) ? median : v
  })
}
for (const pid of Object.keys(playerSeries)) playerSeries[pid] = smooth(playerSeries[pid])

// Value of a pick on a given snapshot, before it has been used.
// Because of the draft lottery, a pick is valued by its projected tier (Early 1-4, Mid 5-8, Late 9-12),
// never its exact slot, and only once the previous season is over (Jan 10); before that it's a Mid pick.
function pickValue(table: Map<string, number>, date: string, a: { season: string; round: number; projSlot: number | null }) {
  const rd = ordinal(a.round)
  const orderKnown = a.projSlot != null && date >= `${a.season}-01-10`
  const tier = !orderKnown ? 'Mid' : a.projSlot! <= 4 ? 'Early' : a.projSlot! <= 8 ? 'Mid' : 'Late'
  const tierName = `${a.season} ${tier} ${rd}`
  if (table.has(tierName)) return table.get(tierName)!
  // For the upcoming draft DynastyProcess lists exact slots ("2026 Pick 1.04"): average the tier's slots.
  const first = tier === 'Early' ? 1 : tier === 'Mid' ? 5 : 9
  const slots = [0, 1, 2, 3]
    .map((k) => table.get(`${a.season} Pick ${a.round}.${String(first + k).padStart(2, '0')}`))
    .filter((v): v is number => v != null)
  if (slots.length) return Math.round(slots.reduce((x, y) => x + y, 0) / slots.length)
  if (table.has(`${a.season} ${rd}`)) return table.get(`${a.season} ${rd}`)!
  // Picks further out than DynastyProcess lists: use the furthest year it has for that round.
  const years = [...table.keys()].filter((k) => new RegExp(`^\\d{4} ${rd}$`).test(k)).sort()
  return years.length ? table.get(years.at(-1)!)! : 0
}

const pickSeries: Record<string, number[]> = {}
for (const [key, a] of pickAssets) {
  pickSeries[key] = smooth(
    dates.map((date, i) =>
      a.playerId && a.draftDate && date >= a.draftDate ? playerSeries[a.playerId]?.[i] ?? 0 : pickValue(pickTables[i], date, a),
    ),
  )
}

// ---------- FantasyCalc history (our own daily snapshots, see fetch-data.ts) ----------

interface FcSnapshot {
  date: string
  players: Record<string, number>
  picks: Record<string, number>
}
const fcByDate = new Map<string, FcSnapshot>()
const fcPublished = join(RAW, 'fc', 'published-archive.json')
if (existsSync(fcPublished)) for (const s of load('fc/published-archive.json').snapshots ?? []) fcByDate.set(s.date, s)
const fcDaily = join(RAW, 'fc', 'daily')
if (existsSync(fcDaily)) for (const f of readdirSync(fcDaily)) if (f.endsWith('.json')) {
  const s: FcSnapshot = load(`fc/daily/${f}`)
  fcByDate.set(s.date, s)
}
const fcSnapshots = [...fcByDate.values()].sort((a, b) => a.date.localeCompare(b.date))
const latestOwnFc = fcSnapshots.at(-1) ?? null

// ---------- Main values: KeepTradeCut history via Dynasty Daddy (see fetch-data.ts) ----------
// KTC superflex values are the basis (it's what this league uses). FantasyCalc (also from Dynasty
// Daddy's history, plus our own daily snapshot for the latest day) is the second opinion.
// DynastyProcess (above) is only a fallback for dates or assets KTC doesn't cover.

type DdHistory = [string, number | null, number | null][]
const ddArchive: { assets: Record<string, DdHistory>; ids: Record<string, string> } = existsSync(join(RAW, 'dd', 'archive.json'))
  ? load('dd/archive.json')
  : { assets: {}, ids: {} }
const ddLatest = Object.values(ddArchive.assets).reduce((m, h) => (h.at(-1)?.[0] ?? '') > m ? h.at(-1)![0] : m, '')

// The timeline: DynastyProcess's weekly dates, plus the latest day we have from KTC/FantasyCalc.
const timeline = [...dates]
for (const d of [ddLatest, latestOwnFc?.date ?? ''].sort()) if (d && d > timeline.at(-1)!) timeline.push(d)
const dpIndex = (date: string) => {
  let j = -1
  for (let k = 0; k < dates.length && dates[k] <= date; k++) j = k
  return j
}

// Value from a Dynasty Daddy history on a date (col 1 = KTC, col 2 = FantasyCalc). A value older than
// 21 days means the asset stopped being listed, which we treat as "no value" (null).
function ddAt(id: string | undefined, date: string, col: 1 | 2): number | null {
  const hist = id ? ddArchive.assets[id] : undefined
  if (!hist?.length) return null
  let row: DdHistory[number] | undefined
  for (const r of hist) {
    if (r[0] > date) break
    row = r
  }
  if (!row || row[col] == null) return null
  const ageDays = (Date.parse(date) - Date.parse(row[0])) / 86400000
  return ageDays > 21 ? null : row[col]
}

const ddPickId = (a: PickAsset, date: string) => {
  const orderKnown = a.projSlot != null && date >= `${a.season}-01-10`
  const tier = !orderKnown ? 'mid' : a.projSlot! <= 4 ? 'early' : a.projSlot! <= 8 ? 'mid' : 'late'
  return `${a.season}${tier}${ordinal(a.round)}pi`
}

const ktcPlayers: Record<string, number[]> = {}
const fcPlayers: Record<string, number[]> = {}
let fallbackPoints = 0
for (const pid of referencedPlayers) {
  const id = ddArchive.ids[pid]
  const ktc = timeline.map((d) => {
    const v = ddAt(id, d, 1)
    if (v != null) return Math.round(v + (sleeperPlayers[pid]?.pos === 'TE' ? tePremiumBoost(v) : 0))
    const j = dpIndex(d)
    const dp = j >= 0 ? playerSeries[pid]?.[j] ?? 0 : 0
    if (dp > 0) fallbackPoints++
    return dp
  })
  if (ktc.some((v) => v > 0)) ktcPlayers[pid] = ktc
  const fc = timeline.map((d, i) =>
    i === timeline.length - 1 && latestOwnFc && latestOwnFc.date >= d && latestOwnFc.players[pid] != null
      ? latestOwnFc.players[pid]
      : ddAt(id, d, 2) ?? 0,
  )
  if (fc.some((v) => v > 0)) fcPlayers[pid] = withTePremium(pid, fc)
}

const ktcPicks: Record<string, number[]> = {}
const fcPicks: Record<string, number[]> = {}
for (const [key, a] of pickAssets) {
  const drafted = (d: string) => a.playerId && a.draftDate && d >= a.draftDate
  ktcPicks[key] = timeline.map((d, i) => {
    if (drafted(d)) return ktcPlayers[a.playerId!]?.[i] ?? 0
    const v = ddAt(ddPickId(a, d), d, 1)
    if (v != null) return v
    const j = dpIndex(d)
    return j >= 0 ? pickSeries[key][j] : 0
  })
  fcPicks[key] = timeline.map((d, i) => {
    if (drafted(d)) return fcPlayers[a.playerId!]?.[i] ?? 0
    // Dynasty Daddy's FantasyCalc pick history has gaps; for the latest day use our own snapshot.
    if (i === timeline.length - 1 && latestOwnFc && latestOwnFc.date >= d) return fcPickValue(latestOwnFc.picks, d, a)
    return ddAt(ddPickId(a, d), d, 2) ?? 0
  })
}

// FantasyCalc names picks "2027 1st (Early)", "2027 1st", ...
function fcPickValue(table: Record<string, number>, date: string, a: PickAsset) {
  const rd = ordinal(a.round)
  const orderKnown = a.projSlot != null && date >= `${a.season}-01-10`
  const tier = !orderKnown ? 'Mid' : a.projSlot! <= 4 ? 'Early' : a.projSlot! <= 8 ? 'Mid' : 'Late'
  for (const name of [`${a.season} ${rd} (${tier})`, `${a.season} ${rd}`]) if (table[name] != null) return table[name]
  const years = Object.keys(table).filter((k) => new RegExp(`^\\d{4} ${rd}$`).test(k)).sort()
  return years.length ? table[years.at(-1)!] : 0
}

// ---------- Weekly scores ----------

const scores: Record<string, Record<number, any[]>> = {}
for (const s of seasons) {
  scores[s.season] = {}
  for (let week = 1; week <= s.lastScoredWeek; week++) {
    const list: any[] = raw[s.season].matchups[week] ?? []
    scores[s.season][week] = list.map((m) => {
      const starters = new Set((m.starters ?? []).filter((p: string) => p !== '0'))
      const pts = Object.entries<number>(m.players_points ?? {})
      pts.forEach(([pid]) => referencedPlayers.add(pid))
      return {
        rosterId: m.roster_id,
        matchupId: m.matchup_id,
        points: Math.round((m.points ?? 0) * 100) / 100,
        starters: Object.fromEntries(pts.filter(([pid]) => starters.has(pid))),
        bench: Object.fromEntries(pts.filter(([pid]) => !starters.has(pid))),
      }
    })
  }
}

// ---------- Players ----------

const players: Record<string, { name: string; pos: string | null; team: string | null }> = {}
for (const pid of referencedPlayers) {
  const p = sleeperPlayers[pid]
  players[pid] = p ? { name: p.name || pid, pos: p.pos, team: p.team } : { name: pid, pos: null, team: null }
}

// ---------- Write ----------

write('league.json', { name: raw[seasonList.at(-1)!].league.name, seasons, managers, rosterOwners, builtAt: new Date().toISOString() })
write('trades.json', trades)
write('players.json', players)
write('values.json', {
  source: 'KeepTradeCut superflex (history via Dynasty Daddy), DynastyProcess where KTC has no value',
  dates: timeline,
  players: ktcPlayers,
  picks: Object.fromEntries([...pickAssets].map(([k, a]) => [k, { ...a, values: ktcPicks[k] }])),
  tePremium: 'KeepTradeCut TE+ curve',
  fc: { dates: timeline, players: fcPlayers, picks: fcPicks },
})
write('fc-archive.json', { source: 'https://api.fantasycalc.com (superflex, 12 teams, PPR)', snapshots: fcSnapshots })
// Compact KTC/FantasyCalc history, published so future runs can restore it instead of re-downloading.
write('ktc-archive.json', { source: 'https://dynasty-daddy.com (KeepTradeCut and FantasyCalc superflex history)', ...ddArchive })
write('scores.json', scores)

// ---------- Report ----------

const tradedPlayers = new Set(trades.flatMap((t) => t.sides.flatMap((s: any) => s.players)))
const noValue = [...tradedPlayers].filter((pid) => !valuedPlayers.has(pid) && sleeperPlayers[pid]?.pos !== 'DEF' && sleeperPlayers[pid]?.pos !== 'K')
console.log(`\n${trades.length} trades, ${tradedPlayers.size} players and ${pickAssets.size} picks traded.`)
console.log(`${[...pickAssets.values()].filter((a) => a.playerId).length} traded picks already turned into players.`)
console.log(`${timeline.length} value dates from ${timeline[0]} to ${timeline.at(-1)}.`)
const noKtc = [...tradedPlayers].filter((pid) => !ddArchive.assets[ddArchive.ids[pid]]?.length)
console.log(`${noKtc.length} traded players with no KTC history (DynastyProcess used instead): ${noKtc.map((pid) => players[pid]?.name).join(', ')}`)
console.log(`${fallbackPoints} player-weeks fell back to DynastyProcess (before KTC listed them, or after they dropped off).`)
console.log(`${noValue.length} traded players never had a DynastyProcess value either.`)
