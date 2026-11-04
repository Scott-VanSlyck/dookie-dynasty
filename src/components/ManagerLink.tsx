import { Link } from 'react-router'
import { managerName, type Data } from '../data'

export default function ManagerLink({ data, userId, className }: { data: Data; userId: string | null; className?: string }) {
  if (!userId) return <span className={className}>Unknown</span>
  return (
    <Link to={`/managers/${userId}`} className={`manager-link ${className ?? ''}`} onClick={(e) => e.stopPropagation()}>
      {managerName(data, userId)}
    </Link>
  )
}

export function Avatar({ src, size = 32 }: { src: string | null; size?: number }) {
  return src ? (
    <img className="avatar" src={src} alt="" width={size} height={size} loading="lazy" onError={(e) => (e.currentTarget.style.visibility = 'hidden')} />
  ) : (
    <span className="avatar" style={{ width: size, height: size }} />
  )
}
