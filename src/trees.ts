// Trade trees: follow what a team received in a trade through everything that happened next.
// A player is kept, released, or traded again (and then we follow what came back). A pick is kept,
// traded again, or used to draft a player (and then we follow the player).

import type { Data, Trade, TradeSide } from './data'
import { pickSeries, playerPoints, today } from './rewind'

export type Asset = { type: 'player'; pid: string } | { type: 'pick'; key: string }

export type Outcome =
  | { type: 'kept' } // still on this team
  | { type: 'released'; date: string } // dropped or released, not traded
  | { type: 'traded'; trade: Trade; packaged: boolean } // sent away; children = what came back (packaged: shown under another asset in the same deal)
  | { type: 'drafted' } // pick used; child = the player
  | { type: 'gone'; date: string | null } // pick used by someone else (moved on draft day)

export interface TreeNode {
  asset: Asset
  rosterId: number
  outcome: Outcome
  valueNow: number // current KTC value if still held, else 0
  points: number // starter points scored for this team while held (players only)
  children: TreeNode[]
}

export interface TreeSummary {
  held: TreeNode[] // assets this chain has turned into and the team still has
  valueNow: number
  points: number
  trades: number // follow-up trades in the chain
}

const MAX_DEPTH = 12

function nextTradeSending(data: Data, rosterId: number, asset: Asset, afterIndex: number) {
  for (let i = afterIndex + 1; i < data.trades.length; i++) {
    const side = data.trades[i].sides.find((s) => s.rosterId === rosterId)
    if (!side) continue
    const sent = asset.type === 'player' ? side.sentPlayers?.includes(asset.pid) : side.sentPicks?.includes(asset.key)
    if (sent) return i
  }
  return -1
}

// `side` is the trade side that brought this asset to the team (its tenure records how long players stayed).
// expanded: later trades already followed in this tree, so a package deal is only followed once.
function grow(data: Data, asset: Asset, side: TradeSide, tradeIndex: number, depth: number, expanded: Set<number>): TreeNode {
  const rosterId = side.rosterId
  const node: TreeNode = { asset, rosterId, outcome: { type: 'kept' }, valueNow: 0, points: 0, children: [] }
  const now = today(data)
  const last = data.values.dates.length - 1

  if (asset.type === 'player') node.points = playerPoints(data, side, asset.pid, now)

  let j = depth < MAX_DEPTH ? nextTradeSending(data, rosterId, asset, tradeIndex) : -1
  // A player who was released and later picked up again isn't part of this chain anymore.
  const left = asset.type === 'player' ? side.tenure[asset.pid]?.[1] ?? null : null
  if (j >= 0 && left && data.trades[j].date > left) j = -1
  if (j >= 0) {
    const trade = data.trades[j]
    const mine = trade.sides.find((s) => s.rosterId === rosterId)!
    if (expanded.has(j)) {
      node.outcome = { type: 'traded', trade, packaged: true }
      return node
    }
    expanded.add(j)
    node.outcome = { type: 'traded', trade, packaged: false }
    node.children = [
      ...mine.players.map((pid) => grow(data, { type: 'player', pid }, mine, j, depth + 1, expanded)),
      ...mine.picks.map((key) => grow(data, { type: 'pick', key }, mine, j, depth + 1, expanded)),
    ]
    return node
  }

  if (asset.type === 'player') {
    if (left) node.outcome = { type: 'released', date: left }
    else node.valueNow = data.values.players[asset.pid]?.[last] ?? 0
    return node
  }

  const pick = data.values.picks[asset.key]
  if (pick?.playerId) {
    if (pick.draftedBy === rosterId && side.tenure[pick.playerId]) {
      node.outcome = { type: 'drafted' }
      // The drafted player is followed from draft day, using this same side's tenure record.
      node.children = [grow(data, { type: 'player', pid: pick.playerId }, side, tradeIndex, depth + 1, expanded)]
    } else {
      node.outcome = { type: 'gone', date: pick.draftDate }
    }
    return node
  }
  node.valueNow = pickSeries(data, asset.key, rosterId).at(-1) ?? 0
  return node
}

// One tree per asset a side received in this trade.
export function tradeTree(data: Data, trade: Trade, sideIndex: number): TreeNode[] {
  const idx = data.trades.indexOf(trade)
  const side = trade.sides[sideIndex]
  const expanded = new Set<number>()
  return [
    ...side.players.map((pid) => grow(data, { type: 'player', pid }, side, idx, 0, expanded)),
    ...side.picks.map((key) => grow(data, { type: 'pick', key }, side, idx, 0, expanded)),
  ]
}

export function summarize(nodes: TreeNode[]): TreeSummary {
  const out: TreeSummary = { held: [], valueNow: 0, points: 0, trades: 0 }
  const walk = (n: TreeNode) => {
    out.points += n.points
    if (n.outcome.type === 'traded' && !n.outcome.packaged) out.trades++
    if (n.outcome.type === 'kept') {
      out.held.push(n)
      out.valueNow += n.valueNow
    }
    n.children.forEach(walk)
  }
  nodes.forEach(walk)
  out.points = Math.round(out.points * 10) / 10
  return out
}
