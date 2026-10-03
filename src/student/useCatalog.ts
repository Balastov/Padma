import { useEffect, useState } from 'react'
import { loadCatalog, type VocabCatalog } from './catalogStore'

export function useCatalog() {
  const [catalog, setCatalog] = useState<VocabCatalog | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    setLoading(true)
    loadCatalog()
      .then((c) => {
        if (active) {
          setCatalog(c)
          setError('')
        }
      })
      .catch((e) => {
        if (active) setError((e as Error).message)
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [])

  return { catalog, error, loading, reload: () => loadCatalog(true).then(setCatalog) }
}
