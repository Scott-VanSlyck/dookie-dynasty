// Turns data/raw/ into the small, clean JSON files the website reads (public/data/).
//   node scripts/build-data.ts
//
// Output files:
//   league.json  - seasons, managers, which manager owned each roster each season, week dates
//   trades.json  - every completed trade, split into what each team received
//   players.json - name/position/team for every player the other files mention
//   values.json  - weekly superflex trade value history for every traded asset
//   scores.json  - weekly points for every roster (starters and bench), every season

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
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
  })
}

// ---------- Draft pick resolution ----------
// A traded pick is identified by (season, round, original roster). Once that season's
// draft order is set we know its slot; once the draft happens we know the player.

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

function draftedPlayer(season: string, round: number, slot: number | null): string | null {
  const r = raw[season]
  const draft = r?.drafts?.[0]
  if (!draft || slot == null || draft.status !== 'complete') return null
  const picks: any[] = r.draftPicks[draft.draft_id] ?? []
  const pick = picks.find((p) => p.round === round && p.draft_slot === slot)
  return pick?.player_id ?? null
}

// ---------- Trades ----------

const trades: any[] = []
const pickAssets = new Map<string, { season: string; round: number; orig: number; slot: number | null; playerId: string | null; draftDate: string | null }>()
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
        const slot = pickSlot(p.season, p.roster_id)
        const playerId = draftedPlayer(p.season, p.round, slot)
        const draft = seasons.find((s) => s.season === p.season)?.draft
        pickAssets.set(key, { season: p.season, round: p.round, orig: p.roster_id, slot, playerId, draftDate: playerId ? draft?.date ?? null : null })
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
      sides,
    })
  }
}
trades.sort((a, b) => a.date.localeCompare(b.date))

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

// Value of a pick on a given snapshot, before it has been used.
function pickValue(table: Map<string, number>, date: string, a: { season: string; round: number; slot: number | null }) {
  const rd = ordinal(a.round)
  const tier = a.slot == null ? 'Mid' : a.slot <= 4 ? 'Early' : a.slot <= 8 ? 'Mid' : 'Late'
  // Draft order is set once the previous season ends; before that, treat every pick as "Mid".
  const orderKnown = a.slot != null && date >= `${a.season}-01-10`
  const slotName = a.slot != null ? `${a.season} Pick ${a.round}.${String(a.slot).padStart(2, '0')}` : ''
  const tries = orderKnown
    ? [slotName, `${a.season} ${tier} ${rd}`, `${a.season} ${rd}`]
    : [`${a.season} Mid ${rd}`, `${a.season} ${rd}`, `${a.season} Pick ${a.round}.06`]
  for (const name of tries) if (table.has(name)) return table.get(name)!
  // Picks further out than DynastyProcess lists: use the furthest year it has for that round.
  const years = [...table.keys()].filter((k) => new RegExp(`^\\d{4} ${rd}$`).test(k)).sort()
  return years.length ? table.get(years.at(-1)!)! : 0
}

const pickSeries: Record<string, number[]> = {}
for (const [key, a] of pickAssets) {
  pickSeries[key] = dates.map((date, i) =>
    a.playerId && a.draftDate && date >= a.draftDate ? playerSeries[a.playerId]?.[i] ?? 0 : pickValue(pickTables[i], date, a),
  )
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
  dates,
  players: playerSeries,
  picks: Object.fromEntries([...pickAssets].map(([k, a]) => [k, { ...a, values: pickSeries[k] }])),
})
write('scores.json', scores)

// ---------- Report ----------

const tradedPlayers = new Set(trades.flatMap((t) => t.sides.flatMap((s: any) => s.players)))
const noValue = [...tradedPlayers].filter((pid) => !valuedPlayers.has(pid) && sleeperPlayers[pid]?.pos !== 'DEF' && sleeperPlayers[pid]?.pos !== 'K')
console.log(`\n${trades.length} trades, ${tradedPlayers.size} players and ${pickAssets.size} picks traded.`)
console.log(`${[...pickAssets.values()].filter((a) => a.playerId).length} traded picks already turned into players.`)
console.log(`${dates.length} value snapshots from ${dates[0]} to ${dates.at(-1)}.`)
console.log(`${noValue.length} traded players never had a DynastyProcess value (deep bench guys count as 0):`)
console.log('  ' + noValue.map((pid) => `${players[pid].name} (${players[pid].pos})`).join(', '))
