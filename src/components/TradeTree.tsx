import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { formatDate, headshot, managerName, pickLabel, type Data, type Trade } from '../data'
import { summarize, tradeTree, type TreeNode } from '../trees'

function AssetName({ data, node }: { data: Data; node: TreeNode }) {
  if (node.asset.type === 'player') {
    const p = data.players[node.asset.pid]
    return (
      <span className="tree-asset">
        <img src={headshot(node.asset.pid)} alt="" loading="lazy" onError={(e) => (e.currentTarget.style.visibility = 'hidden')} />
        <span className={`pos pos-${p?.pos ?? 'NA'}`}>{p?.pos ?? '?'}</span>
        <strong>{p?.name ?? node.asset.pid}</strong>
      </span>
    )
  }
  return (
    <span className="tree-asset">
      <span className="pick-icon">PK</span>
      <span className="pos pos-PICK">PICK</span>
      <strong>{pickLabel(data.values.picks[node.asset.key])}</strong>
    </span>
  )
}

function Outcome({ data, node }: { data: Data; node: TreeNode }) {
  const pts = node.points > 0 ? `${node.points.toFixed(1)} pts` : ''
  const o = node.outcome
  let text: ReactNode
  if (o.type === 'kept') text = <span className="gain">still on the team · {node.valueNow.toLocaleString()} KTC</span>
  else if (o.type === 'released') text = <span className="muted">released {formatDate(o.date)}</span>
  else if (o.type === 'drafted') text = <span className="muted">used to draft</span>
  else if (o.type === 'gone') text = <span className="muted">pick ended up with another team on draft day</span>
  else {
    const partners = o.trade.sides.filter((s) => s.rosterId !== node.rosterId).map((s) => managerName(data, s.userId))
    text = (
      <span>
        <Link to={`/trades/${o.trade.id}`}>traded {formatDate(o.trade.date)}</Link>
        <span className="muted">
          {' '}
          to {partners.join(' & ')}
          {o.packaged ? ' in the same deal as above' : ' for:'}
        </span>
      </span>
    )
  }
  return (
    <span className="tree-outcome small">
      {text}
      {pts && <span className="muted"> · {pts}</span>}
    </span>
  )
}

function Branch({ data, nodes }: { data: Data; nodes: TreeNode[] }) {
  if (!nodes.length) return <ul className="tree"><li className="muted small">nothing</li></ul>
  return (
    <ul className="tree">
      {nodes.map((n, i) => (
        <li key={i}>
          <div className="tree-node">
            <AssetName data={data} node={n} />
            <Outcome data={data} node={n} />
          </div>
          {(n.children.length > 0 || (n.outcome.type === 'traded' && !n.outcome.packaged)) && <Branch data={data} nodes={n.children} />}
        </li>
      ))}
    </ul>
  )
}

export default function TradeTree({ data, trade, names }: { data: Data; trade: Trade; names: string[] }) {
  const trees = trade.sides.map((_, i) => tradeTree(data, trade, i))
  const sums = trees.map(summarize)
  return (
    <>
      <div className="hero-verdicts">
        {sums.map((s, i) => (
          <div key={i}>
            <span className="muted small">
              <span className="dot" style={{ background: `var(--series-${i + 1})` }} />
              What {names[i]}'s side became
            </span>
            <span>
              {s.valueNow.toLocaleString()} <span className="muted small">KTC still on the team</span>
            </span>
            <span className="muted small">
              {s.held.length} asset{s.held.length === 1 ? '' : 's'} left · {s.points.toFixed(1)} pts scored along the way
              {s.trades > 0 ? ` · ${s.trades} follow-up trade${s.trades === 1 ? '' : 's'}` : ''}
            </span>
          </div>
        ))}
      </div>
      {trees.map((nodes, i) => (
        <section key={i} className="side-detail">
          <h3>
            <span className="dot" style={{ background: `var(--series-${i + 1})` }} />
            {names[i]}'s side
          </h3>
          <Branch data={data} nodes={nodes} />
        </section>
      ))}
    </>
  )
}
