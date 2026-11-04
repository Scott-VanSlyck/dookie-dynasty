// Small helpers for the free Sleeper API (https://docs.sleeper.com).
// No API key needed; Sleeper asks that we stay under ~1000 calls per minute.

export const CURRENT_LEAGUE_ID = '1313238117100056576'

const BASE = 'https://api.sleeper.app/v1'

export interface League {
  league_id: string
  previous_league_id: string | null
  name: string
  season: string
  status: string
  total_rosters: number
}

export async function getLeague(id: string): Promise<League> {
  const res = await fetch(`${BASE}/league/${id}`)
  if (!res.ok) throw new Error(`Sleeper returned ${res.status} for league ${id}`)
  return res.json()
}

// Follows previous_league_id back to the league's first season.
// Returns newest season first.
export async function getLeagueHistory(startId = CURRENT_LEAGUE_ID): Promise<League[]> {
  const seasons: League[] = []
  let id: string | null = startId
  while (id && id !== '0') {
    const league = await getLeague(id)
    seasons.push(league)
    id = league.previous_league_id
  }
  return seasons
}
