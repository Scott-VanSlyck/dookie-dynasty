import { useState, type PointerEvent } from 'react'
import { formatDate } from '../data'

interface Props {
  dates: string[]
  series: number[][]
  names: string[]
  markers: { date: string; label: string }[]
}

const W = 760
const H = 260
const PAD = { top: 16, right: 110, bottom: 28, left: 52 }
const fmt = (v: number) => (v >= 1000 ? `${(v / 1000).toFixed(v >= 10000 ? 0 : 1)}k` : String(Math.round(v)))

// Each side's total trade value over time, one line per side.
export default function ValueChart({ dates, series, names, markers }: Props) {
  const [hover, setHover] = useState<number | null>(null)
  if (dates.length < 2) return <p className="muted small">Not enough value history yet to chart this trade.</p>

  const t0 = Date.parse(dates[0])
  const t1 = Date.parse(dates.at(-1)!)
  const max = Math.max(1, ...series.flat())
  const niceMax = Math.ceil(max / 2000) * 2000
  const x = (d: string) => PAD.left + ((Date.parse(d) - t0) / (t1 - t0 || 1)) * (W - PAD.left - PAD.right)
  const y = (v: number) => H - PAD.bottom - (v / niceMax) * (H - PAD.top - PAD.bottom)
  const ticks = Array.from({ length: 5 }, (_, i) => (niceMax / 4) * i)
  const years = [...new Set(dates.map((d) => d.slice(0, 4)))].slice(1)

  // Keep end labels from overlapping: nudge them apart vertically.
  const ends = series.map((s, i) => ({ i, y: y(s.at(-1)!) })).sort((a, b) => a.y - b.y)
  for (let k = 1; k < ends.length; k++) if (ends[k].y - ends[k - 1].y < 16) ends[k].y = ends[k - 1].y + 16

  const onMove = (e: PointerEvent<SVGRectElement>) => {
    const box = e.currentTarget.getBoundingClientRect()
    const px = ((e.clientX - box.left) / box.width) * (W - PAD.left - PAD.right) + PAD.left
    let best = 0
    for (let i = 1; i < dates.length; i++) if (Math.abs(x(dates[i]) - px) < Math.abs(x(dates[best]) - px)) best = i
    setHover(best)
  }

  return (
    <figure className="chart">
      <div className="legend">
        {names.map((n, i) => (
          <span key={i}>
            <i style={{ background: `var(--series-${i + 1})` }} />
            {n}
          </span>
        ))}
      </div>
      <div className="chart-box">
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Trade value of each side over time">
          {ticks.map((t) => (
            <g key={t}>
              <line className="grid" x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} />
              <text className="axis" x={PAD.left - 8} y={y(t) + 4} textAnchor="end">
                {fmt(t)}
              </text>
            </g>
          ))}
          {years.map((yr) => (
            <text key={yr} className="axis" x={x(`${yr}-01-01`)} y={H - 8} textAnchor="middle">
              {yr}
            </text>
          ))}
          {markers
            .filter((m) => m.date > dates[0] && m.date < dates.at(-1)!)
            .map((m) => (
              <g key={m.label}>
                <line className="marker" x1={x(m.date)} x2={x(m.date)} y1={PAD.top} y2={H - PAD.bottom} />
                <text className="axis" x={x(m.date) + 4} y={PAD.top + 8}>
                  {m.label}
                </text>
              </g>
            ))}
          {series.map((s, i) => (
            <polyline
              key={i}
              fill="none"
              stroke={`var(--series-${i + 1})`}
              strokeWidth={2}
              strokeLinejoin="round"
              points={s.map((v, j) => `${x(dates[j])},${y(v)}`).join(' ')}
            />
          ))}
          {ends.map(({ i, y: ly }) => (
            <text key={i} className="end-label" x={W - PAD.right + 8} y={ly + 4}>
              {names[i]}
            </text>
          ))}
          {hover != null && (
            <g>
              <line className="crosshair" x1={x(dates[hover])} x2={x(dates[hover])} y1={PAD.top} y2={H - PAD.bottom} />
              {series.map((s, i) => (
                <circle key={i} cx={x(dates[hover])} cy={y(s[hover])} r={4} fill={`var(--series-${i + 1})`} stroke="var(--card)" strokeWidth={2} />
              ))}
            </g>
          )}
          <rect
            x={PAD.left}
            y={PAD.top}
            width={W - PAD.left - PAD.right}
            height={H - PAD.top - PAD.bottom}
            fill="transparent"
            onPointerMove={onMove}
            onPointerLeave={() => setHover(null)}
          />
        </svg>
        {hover != null && (
          <div className="tooltip" style={{ left: `${(x(dates[hover]) / W) * 100}%` }}>
            <strong>{formatDate(dates[hover])}</strong>
            {series
              .map((s, i) => ({ i, v: s[hover] }))
              .sort((a, b) => b.v - a.v)
              .map(({ i, v }) => (
                <div key={i}>
                  <i style={{ background: `var(--series-${i + 1})` }} />
                  {names[i]} <b>{v.toLocaleString()}</b>
                </div>
              ))}
          </div>
        )}
      </div>
    </figure>
  )
}
