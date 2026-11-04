import { useMemo } from 'react'
import { useSearchParams } from 'react-router'
import ManagerLink from '../components/ManagerLink'
import { formatDate, headshot, managerName, useData, type Data, type Draft, type DraftPick } from '../data'
import { snapshotIndex } from '../rewind'
import { signed } from '../managers'
import { useTitle } from '../useTitle'

const pickLabel = (round: number, slot: number) => `${round}.${String(slot).padStart(2, '0')}`

interface Row {
  pick: DraftPick
  valueAtDraft: number
  valueNow: number
  change: number
  points: number
}

// Starter points the player scored for the team that drafted him.
function pointsForDrafter(data: Data, draft: Draft, pick: DraftPick) {
  let total = 0
  for (const s of data.league.seasons) {
    if (s.season < draft.season) continue
    for (const rows of Object.values(data.scores[s.season] ?? {})) {
      const row = rows.find((r) => r.rosterId === pick.rosterId)
      total += row?.starters[pick.playerId] ?? 0
    }
  }
  return Math.round(total * 10) / 10
}

function buildRows(data: Data, draft: Draft): Row[] {
  const i0 = draft.date ? snapshotIndex(data, draft.date) : -1
  const iN = data.values.dates.length - 1
  return draft.picks.map((pick) => {
    const series = data.values.players[pick.playerId]
    const valueAtDraft = i0 >= 0 ? series?.[i0] ?? 0 : 0
    const valueNow = series?.[iN] ?? 0
    return { pick, valueAtDraft, valueNow, change: valueNow - valueAtDraft, points: pointsForDrafter(data, draft, pick) }
  })
}

function Highlight({ data, title, row, value }: { data: Data; title: string; row: Row | undefined; value: string }) {
  if (!row) return null
  const p = data.players[row.pick.playerId]
  return (
    <div className="record">
      <span className="muted small">{title}</span>
      <strong>{p?.name ?? 'Unknown'}</strong>
      <span className="small">
        {pickLabel(row.pick.round, row.pick.slot)} by <ManagerLink data={data} userId={row.pick.userId} />
      </span>
      <span className="muted small">{value}</span>
    </div>
  )
}

export default function Drafts() {
  const { data, error } = useData()
  const [params, setParams] = useSearchParams()
  useTitle('Rookie drafts')

  const drafts = useMemo(() => (data ? [...data.drafts].reverse() : []), [data])
  const draft = drafts.find((d) => d.season === params.get('season')) ?? drafts[0]
  const rows = useMemo(() => (data && draft ? buildRows(data, draft) : []), [data, draft])

  if (error) return <p className="error">{error}</p>
  if (!data) return <p className="muted">Loading…</p>
  if (!draft) return <p className="muted">No rookie drafts yet.</p>

  const moved = draft.picks.filter((p) => p.projSlot != null && p.projSlot !== p.slot && p.round === 1)
  const byValue = [...rows].sort((a, b) => b.valueNow - a.valueNow)
  const byChange = [...rows].sort((a, b) => b.change - a.change)
  const firstRound = rows.filter((r) => r.pick.round === 1)
  const bust = [...firstRound].sort((a, b) => a.change - b.change)[0]
  const steal = [...rows].filter((r) => r.pick.round > 1).sort((a, b) => b.valueNow - a.valueNow)[0]

  return (
    <>
      <h1>Rookie drafts</h1>
      <p className="muted">Every pick, where it moved on draft day, and how it has aged by KTC value.</p>

      <div className="tabs">
        {drafts.map((d) => (
          <button key={d.season} className={d.season === draft.season ? 'active' : ''} onClick={() => setParams({ season: d.season }, { replace: true })}>
            {d.season}
          </button>
        ))}
      </div>
      <p className="muted small">
        {draft.date ? formatDate(draft.date) : ''} · {draft.rounds} rounds
      </p>

      <div className="records">
        <Highlight data={data} title="Most valuable today" row={byValue[0]} value={`${byValue[0]?.valueNow.toLocaleString()} KTC`} />
        <Highlight data={data} title="Biggest riser" row={byChange[0]} value={`${signed(byChange[0]?.change ?? 0)} since the draft`} />
        <Highlight data={data} title="Best pick after round 1" row={steal} value={`${steal?.valueNow.toLocaleString()} KTC`} />
        <Highlight data={data} title="Biggest 1st-round drop" row={bust} value={`${signed(bust?.change ?? 0)} since the draft`} />
      </div>

      {moved.length > 0 && (
        <>
          <h2>Draft-day moves</h2>
          <p className="muted small">First-round picks that ended up at a different slot than Sleeper's draft order had them (lottery and swaps).</p>
          <div className="partners">
            {moved
              .sort((a, b) => a.slot - b.slot)
              .map((p) => (
                <span key={p.pickNo} className="chip">
                  {managerName(data, p.origUserId)}'s pick{' '}
                  <span className={p.slot < p.projSlot! ? 'gain' : 'drop'}>
                    {pickLabel(1, p.projSlot!)} → {pickLabel(1, p.slot)} {p.slot < p.projSlot! ? '▲' : '▼'}
                  </span>
                </span>
              ))}
          </div>
        </>
      )}

      <h2>Every pick</h2>
      <div className="table-scroll">
        <table className="leaderboard">
          <thead>
            <tr>
              <th>Pick</th>
              <th>Player</th>
              <th>Team</th>
              <th className="num hide-sm">At draft</th>
              <th className="num">Today</th>
              <th className="num hide-sm" title="Starter points scored for the team that drafted him">Pts for team</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const p = data.players[r.pick.playerId]
              const via = r.pick.origRosterId !== r.pick.rosterId
              return (
                <tr key={r.pick.pickNo} className={r.pick.round > 1 && r.pick.slot === 1 ? 'round-break' : ''}>
                  <td className="muted">{pickLabel(r.pick.round, r.pick.slot)}</td>
                  <td>
                    <div className="asset">
                      <img src={headshot(r.pick.playerId)} alt="" loading="lazy" onError={(e) => (e.currentTarget.style.visibility = 'hidden')} />
                      <span className={`pos pos-${p?.pos ?? 'NA'}`}>{p?.pos ?? '?'}</span>
                      <span>{p?.name ?? r.pick.playerId}</span>
                    </div>
                  </td>
                  <td>
                    <ManagerLink data={data} userId={r.pick.userId} />
                    {via && (
                      <span className="muted small">
                        <br />
                        via {managerName(data, r.pick.origUserId)}
                      </span>
                    )}
                  </td>
                  <td className="num hide-sm">{r.valueAtDraft.toLocaleString()}</td>
                  <td className="num">
                    {r.valueNow.toLocaleString()}
                    <span className={`small ${r.change > 0 ? 'gain' : r.change < 0 ? 'drop' : 'muted'}`}>
                      <br />
                      {signed(r.change)}
                    </span>
                  </td>
                  <td className="num hide-sm">{r.points.toFixed(1)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </>
  )
}
