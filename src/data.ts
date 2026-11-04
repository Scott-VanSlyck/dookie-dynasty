// Loads the JSON files built by scripts/build-data.ts (public/data/) and
// provides small helpers for turning IDs into names.

import { useEffect, useState } from 'react'

export interface Season {
  season: string
  leagueId: string
  status: string
  lastScoredWeek: number
  playoffWeekStart: number
  weekDates: Record<string, string>
  draft: { id: string; type: string; rounds: number; date: string | null } | null
}

export interface Manager {
  name: string
  team: string | null
  avatar: string | null
}

export interface League {
  name: string
  seasons: Season[]
  managers: Record<string, Manager>
  rosterOwners: Record<string, Record<string, string>>
  builtAt: string
}

export interface TradeSide {
  rosterId: number
  userId: string | null
  players: string[]
  picks: string[] // keys into values.picks: "season-round-originalRosterId"
  faab: number
}

export interface Trade {
  id: string
  season: string
  week: number
  date: string
  sides: TradeSide[]
}

export interface Player {
  name: string
  pos: string | null
  team: string | null
}

export interface PickAsset {
  season: string
  round: number
  orig: number
  slot: number | null
  playerId: string | null
  draftDate: string | null
  values: number[]
}

export interface Values {
  dates: string[]
  players: Record<string, number[]>
  picks: Record<string, PickAsset>
}

export interface ScoreRow {
  rosterId: number
  matchupId: number | null
  points: number
  starters: Record<string, number>
  bench: Record<string, number>
}

export interface Data {
  league: League
  trades: Trade[]
  players: Record<string, Player>
  values: Values
  scores: Record<string, Record<string, ScoreRow[]>>
}

let cache: Promise<Data> | null = null

async function getJson<T>(name: string): Promise<T> {
  const res = await fetch(`${import.meta.env.BASE_URL}data/${name}`)
  if (!res.ok) throw new Error(`Couldn't load ${name} (${res.status})`)
  return res.json()
}

export function loadData(): Promise<Data> {
  cache ??= Promise.all([
    getJson<League>('league.json'),
    getJson<Trade[]>('trades.json'),
    getJson<Record<string, Player>>('players.json'),
    getJson<Values>('values.json'),
    getJson<Data['scores']>('scores.json'),
  ]).then(([league, trades, players, values, scores]) => ({ league, trades, players, values, scores }))
  return cache
}

export function useData() {
  const [data, setData] = useState<Data | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    loadData().then(setData).catch((e: Error) => setError(e.message))
  }, [])
  return { data, error }
}

// ---------- helpers ----------

export const ordinal = (n: number) => `${n}${n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th'}`

export function managerName(data: Data, userId: string | null) {
  return (userId && data.league.managers[userId]?.name) || 'Unknown'
}

// Who originally owned a pick: the manager of that roster in the pick's season,
// or (for future seasons) the roster's most recent manager.
export function pickOriginalOwner(data: Data, pick: PickAsset) {
  const owners = data.league.rosterOwners
  const latest = data.league.seasons.at(-1)!.season
  return owners[pick.season]?.[pick.orig] ?? owners[latest]?.[pick.orig] ?? null
}

export function pickLabel(pick: PickAsset) {
  const slot = pick.slot != null && pick.draftDate ? ` (${pick.round}.${String(pick.slot).padStart(2, '0')})` : ''
  return `${pick.season} ${ordinal(pick.round)}${slot}`
}

export function formatDate(iso: string) {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export const headshot = (pid: string) => `https://sleepercdn.com/content/nfl/players/thumb/${pid}.jpg`
