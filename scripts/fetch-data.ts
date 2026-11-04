// Downloads everything the site needs into data/raw/ (not committed to git).
//   node scripts/fetch-data.ts
// Safe to re-run: finished seasons and old value snapshots are cached and skipped,
// the current season is always refreshed.

import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

const CURRENT_LEAGUE_ID = '1313238117100056576'
const SLEEPER = 'https://api.sleeper.app/v1'
const DP_REPO = 'dynastyprocess/data'
const DP_VALUES_PATH = 'files/values.csv'
const DP_HISTORY_START = '2023-06-01T00:00:00Z' // a little before the league's first season
const RAW = join(import.meta.dirname, '..', 'data', 'raw')
const ONE_DAY = 24 * 60 * 60 * 1000

// ---------- helpers ----------

function save(path: string, data: unknown) {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, typeof data === 'string' ? data : JSON.stringify(data))
}

function isFresh(path: string, maxAgeMs: number) {
  return existsSync(path) && Date.now() - statSync(path).mtimeMs < maxAgeMs
}

async function get(url: string, kind: 'json' | 'text' = 'json', tries = 4): Promise<any> {
  for (let attempt = 1; ; attempt++) {
    try {
      const headers: Record<string, string> = { 'User-Agent': 'dookie-dynasty-site' }
      // In GitHub Actions, use the workflow's token so GitHub API rate limits aren't shared with other users.
      if (process.env.GITHUB_TOKEN && url.startsWith('https://api.github.com/')) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`
      const res = await fetch(url, { headers })
      if (res.status === 404) return null
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
      return kind === 'json' ? await res.json() : await res.text()
    } catch (err) {
      if (attempt >= tries) throw new Error(`Failed to fetch ${url}: ${(err as Error).message}`)
      await new Promise((r) => setTimeout(r, 500 * 2 ** attempt))
    }
  }
}

// Runs fn over items with at most `limit` requests in flight.
async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let next = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++
      out[i] = await fn(items[i])
    }
  })
  await Promise.all(workers)
  return out
}

// ---------- Sleeper ----------

async function fetchSeason(leagueId: string) {
  const league = await get(`${SLEEPER}/league/${leagueId}`)
  const dir = join(RAW, 'sleeper', league.season)
  const done =
    league.status === 'complete' && existsSync(join(dir, 'complete.flag')) && existsSync(join(dir, 'winners_bracket.json'))
  if (done) {
    console.log(`  ${league.season}: cached (season complete)`)
    return league
  }

  const weeks = Array.from({ length: 19 }, (_, i) => i) // 0..18
  const [users, rosters, tradedPicks, drafts, winnersBracket, losersBracket, txWeeks, matchupWeeks] = await Promise.all([
    get(`${SLEEPER}/league/${leagueId}/users`),
    get(`${SLEEPER}/league/${leagueId}/rosters`),
    get(`${SLEEPER}/league/${leagueId}/traded_picks`),
    get(`${SLEEPER}/league/${leagueId}/drafts`),
    get(`${SLEEPER}/league/${leagueId}/winners_bracket`),
    get(`${SLEEPER}/league/${leagueId}/losers_bracket`),
    mapLimit(weeks, 6, (w) => get(`${SLEEPER}/league/${leagueId}/transactions/${w}`)),
    mapLimit(weeks.slice(1), 6, (w) => get(`${SLEEPER}/league/${leagueId}/matchups/${w}`)),
  ])

  // Same transaction can show up under more than one week; keep one copy.
  const txById = new Map<string, any>()
  for (const list of txWeeks) for (const tx of list ?? []) txById.set(tx.transaction_id, tx)

  const matchups: Record<number, any[]> = {}
  matchupWeeks.forEach((list, i) => {
    if (list?.length) matchups[i + 1] = list
  })

  const draftPicks: Record<string, any[]> = {}
  for (const d of drafts ?? []) draftPicks[d.draft_id] = (await get(`${SLEEPER}/draft/${d.draft_id}/picks`)) ?? []

  save(join(dir, 'league.json'), league)
  save(join(dir, 'users.json'), users)
  save(join(dir, 'rosters.json'), rosters)
  save(join(dir, 'traded_picks.json'), tradedPicks)
  save(join(dir, 'drafts.json'), drafts)
  save(join(dir, 'draft_picks.json'), draftPicks)
  save(join(dir, 'transactions.json'), [...txById.values()])
  save(join(dir, 'matchups.json'), matchups)
  save(join(dir, 'winners_bracket.json'), winnersBracket ?? [])
  save(join(dir, 'losers_bracket.json'), losersBracket ?? [])
  if (league.status === 'complete') save(join(dir, 'complete.flag'), new Date().toISOString())

  const trades = [...txById.values()].filter((t) => t.type === 'trade' && t.status === 'complete')
  console.log(`  ${league.season}: ${txById.size} transactions (${trades.length} trades), ${Object.keys(matchups).length} weeks of scores`)
  return league
}

async function fetchSleeper() {
  console.log('Sleeper: league history')
  const seasons: string[] = []
  let id: string | null = CURRENT_LEAGUE_ID
  while (id && id !== '0') {
    const league = await fetchSeason(id)
    seasons.push(league.season)
    id = league.previous_league_id
  }
  save(join(RAW, 'sleeper', 'seasons.json'), seasons.sort())

  const playersPath = join(RAW, 'sleeper', 'players.json')
  if (isFresh(playersPath, ONE_DAY)) {
    console.log('Sleeper: player database cached (less than a day old)')
  } else {
    console.log('Sleeper: downloading player database (large, once a day)...')
    const all = await get(`${SLEEPER}/players/nfl`)
    // Keep only the fields we use so the file stays small.
    const slim: Record<string, any> = {}
    for (const [pid, p] of Object.entries<any>(all)) {
      slim[pid] = {
        name: p.full_name ?? [p.first_name, p.last_name].filter(Boolean).join(' '),
        pos: p.position ?? null,
        team: p.team ?? null,
        birth: p.birth_date ?? null,
        years_exp: p.years_exp ?? null,
      }
    }
    save(playersPath, slim)
    console.log(`  ${Object.keys(slim).length} players`)
  }
}

// ---------- DynastyProcess value history ----------

interface Snapshot {
  sha: string
  date: string // YYYY-MM-DD
}

async function fetchValueHistory() {
  console.log('DynastyProcess: value history')
  const commits: any[] = []
  for (let page = 1; ; page++) {
    const url = `https://api.github.com/repos/${DP_REPO}/commits?path=${DP_VALUES_PATH}&since=${DP_HISTORY_START}&per_page=100&page=${page}`
    const batch = await get(url)
    if (!batch) throw new Error('GitHub API returned nothing (rate limited?). Try again in an hour.')
    commits.push(...batch)
    if (batch.length < 100) break
  }

  // One snapshot per day (keep the latest commit of each day).
  const byDate = new Map<string, Snapshot>()
  for (const c of commits.reverse()) {
    const date = c.commit.committer.date.slice(0, 10)
    byDate.set(date, { sha: c.sha, date })
  }
  const snapshots = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date))

  const dir = join(RAW, 'dp', 'values')
  const missing = snapshots.filter((s) => !existsSync(join(dir, `${s.date}.csv`)))
  console.log(`  ${snapshots.length} weekly snapshots (${snapshots[0]?.date} to ${snapshots.at(-1)?.date}), downloading ${missing.length} new`)
  await mapLimit(missing, 8, async (s) => {
    const csv = await get(`https://raw.githubusercontent.com/${DP_REPO}/${s.sha}/${DP_VALUES_PATH}`, 'text')
    if (csv) save(join(dir, `${s.date}.csv`), csv)
  })
  save(join(RAW, 'dp', 'snapshots.json'), snapshots)

  const idsPath = join(RAW, 'dp', 'db_playerids.csv')
  if (!isFresh(idsPath, 7 * ONE_DAY)) {
    console.log('  downloading player ID map')
    save(idsPath, await get(`https://raw.githubusercontent.com/${DP_REPO}/master/files/db_playerids.csv`, 'text'))
  }
}

// ---------- FantasyCalc (market values from real trades, today only) ----------
// FantasyCalc only publishes current values, so we keep our own history: one snapshot per day,
// stored in an archive that the site publishes (public/data/fc-archive.json). Each run starts from
// the live site's copy, so the history survives even if the GitHub Actions cache is cleared.

const FC_URL = 'https://api.fantasycalc.com/values/current?isDynasty=true&numQbs=2&numTeams=12&ppr=1'
const SITE_ARCHIVE_URL = 'https://scott-vanslyck.github.io/dookie-dynasty/data/fc-archive.json'

async function fetchFantasyCalc() {
  console.log('FantasyCalc: current values')
  const dir = join(RAW, 'fc')
  const published = await get(SITE_ARCHIVE_URL).catch(() => null)
  if (published?.snapshots) save(join(dir, 'published-archive.json'), published)

  const list = await get(FC_URL).catch((e: Error) => (console.log(`  skipped: ${e.message}`), null))
  if (!Array.isArray(list)) return
  const players: Record<string, number> = {}
  const picks: Record<string, number> = {}
  for (const row of list) {
    if (row.player?.position === 'PICK') picks[row.player.name] = row.value
    else if (row.player?.sleeperId) players[row.player.sleeperId] = row.value
  }
  const date = new Date().toISOString().slice(0, 10)
  save(join(dir, 'daily', `${date}.json`), { date, players, picks })
  console.log(`  ${Object.keys(players).length} players, ${Object.keys(picks).length} picks saved for ${date}` + (published ? `; ${published.snapshots.length} earlier days from the live site` : ''))
}

// ---------- KeepTradeCut history via Dynasty Daddy ----------
// Dynasty Daddy (dynasty-daddy.com) has a free, keyless API with daily value history back to 2023
// for KeepTradeCut (superflex), FantasyCalc and others, for players and Early/Mid/Late picks.
// Each asset's full history is ~2 MB, so we download it once, keep only date + KTC + FantasyCalc
// values, and after that just append today's values from a single "all players today" call.
// The compact archive is also published with the site (ktc-archive.json) and restored from there,
// so the big one-time download never has to be repeated.

const DD = 'https://dynasty-daddy.com/api/v1'
const SITE_KTC_ARCHIVE_URL = 'https://scott-vanslyck.github.io/dookie-dynasty/data/ktc-archive.json'
type DdHistory = [string, number | null, number | null][] // [date, KTC superflex, FantasyCalc superflex]

const ddName = (name: string, pos: string) => name.toLowerCase().replace(/[^a-z]/g, '') + pos.toLowerCase()

async function fetchKtcHistory() {
  console.log('Dynasty Daddy: KeepTradeCut value history')
  const dir = join(RAW, 'dd')
  const archivePath = join(dir, 'archive.json')
  let archive: { assets: Record<string, DdHistory>; ids: Record<string, string> } = existsSync(archivePath)
    ? JSON.parse(readFileSync(archivePath, 'utf8'))
    : { assets: {}, ids: {} }
  if (!Object.keys(archive.assets).length) {
    const published = await get(SITE_KTC_ARCHIVE_URL).catch(() => null)
    if (published?.assets) {
      archive = { assets: published.assets, ids: published.ids ?? {} }
      console.log(`  restored ${Object.keys(archive.assets).length} histories from the live site`)
    }
  }

  // Everyone we may need a value for: every player ever traded, and every rookie drafted.
  const seasons: string[] = JSON.parse(readFileSync(join(RAW, 'sleeper', 'seasons.json'), 'utf8'))
  const needed = new Set<string>()
  for (const s of seasons) {
    for (const tx of JSON.parse(readFileSync(join(RAW, 'sleeper', s, 'transactions.json'), 'utf8')))
      if (tx.type === 'trade') Object.keys(tx.adds ?? {}).forEach((pid) => needed.add(pid))
    const picks = JSON.parse(readFileSync(join(RAW, 'sleeper', s, 'draft_picks.json'), 'utf8'))
    if (s !== seasons[0]) for (const list of Object.values<any[]>(picks)) list.forEach((p) => p.player_id && needed.add(p.player_id))
  }

  const today: any[] = (await get(`${DD}/player/all/today?market=0`)) ?? []
  const bySleeper = new Map(today.filter((r) => r.sleeper_id).map((r) => [String(r.sleeper_id), r.name_id]))
  const sleeperPlayers = JSON.parse(readFileSync(join(RAW, 'sleeper', 'players.json'), 'utf8'))
  for (const pid of needed) {
    const p = sleeperPlayers[pid]
    const id = bySleeper.get(pid) ?? archive.ids[pid] ?? (p?.name && p?.pos ? ddName(p.name, p.pos) : null)
    if (id) archive.ids[pid] = id
  }
  // Picks: "2025mid1stpi" etc. for every draft year the league could have traded.
  const pickIds: string[] = []
  const lastYear = new Date().getFullYear() + 3
  for (let y = 2023; y <= lastYear; y++)
    for (const tier of ['early', 'mid', 'late']) for (const rd of ['1st', '2nd', '3rd', '4th']) pickIds.push(`${y}${tier}${rd}pi`)

  const wanted = [...new Set([...Object.values(archive.ids), ...pickIds])]
  const missing = wanted.filter((id) => !archive.assets[id])
  console.log(`  ${wanted.length} players and picks; downloading full history for ${missing.length} new ones`)
  let done = 0
  await mapLimit(missing, 3, async (id) => {
    const rows: any[] = (await get(`${DD}/player/${id}`).catch(() => null)) ?? []
    const byDate = new Map<string, [string, number | null, number | null]>()
    for (const r of rows) {
      if (!r?.date) continue
      const d = r.date.slice(0, 10)
      byDate.set(d, [d, r.sf_trade_value ?? null, r.fc_sf_trade_value ?? null])
    }
    archive.assets[id] = [...byDate.values()].sort((a, b) => a[0].localeCompare(b[0]))
    if (++done % 50 === 0) console.log(`    ${done}/${missing.length}`)
  })

  // Append today's KTC values to everything we track.
  const todayDate = today[0]?.date?.slice(0, 10)
  if (todayDate) {
    const byId = new Map(today.map((r) => [r.name_id, r]))
    for (const [id, hist] of Object.entries(archive.assets)) {
      const r = byId.get(id)
      if (!r || hist.at(-1)?.[0] === todayDate) continue
      hist.push([todayDate, r.sf_trade_value ?? null, hist.at(-1)?.[2] ?? null])
    }
  }
  save(archivePath, archive)
  const withData = Object.values(archive.assets).filter((h) => h.length).length
  console.log(`  ${withData} assets with history, latest ${todayDate ?? 'unknown'}`)
}

// ---------- main ----------

const started = Date.now()
await fetchSleeper()
await fetchValueHistory()
await fetchFantasyCalc()
await fetchKtcHistory()
console.log(`Done in ${((Date.now() - started) / 1000).toFixed(1)}s. Raw data is in data/raw/. Next: node scripts/build-data.ts`)

