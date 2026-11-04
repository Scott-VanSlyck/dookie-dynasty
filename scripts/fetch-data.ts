// Downloads everything the site needs into data/raw/ (not committed to git).
//   node scripts/fetch-data.ts
// Safe to re-run: finished seasons and old value snapshots are cached and skipped,
// the current season is always refreshed.

import { existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs'
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

// ---------- main ----------

const started = Date.now()
await fetchSleeper()
await fetchValueHistory()
console.log(`Done in ${((Date.now() - started) / 1000).toFixed(1)}s. Raw data is in data/raw/. Next: node scripts/build-data.ts`)

