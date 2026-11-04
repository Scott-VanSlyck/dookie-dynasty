import { useEffect } from 'react'

// Sets the browser tab title for a page ("Trades · Dookie Dynasty").
export function useTitle(title: string | null | undefined) {
  useEffect(() => {
    document.title = title ? `${title} · Dookie Dynasty` : 'Dookie Dynasty'
  }, [title])
}
