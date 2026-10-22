import { useEffect, useState } from 'react'
import WordProgress from '../../components/WordProgress'
import { fetchMyMetrics } from '../../student/lexicon'
import type { WordMetrics } from '../../student/lexicon'
import './ProgressPage.css'

export default function ProgressPage() {
  const [metrics, setMetrics] = useState<WordMetrics | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    let active = true
    fetchMyMetrics(7)
      .then((m) => active && setMetrics(m))
      .catch((e: Error) => active && setError(e.message))
    return () => {
      active = false
    }
  }, [])
  return (
    <div className="progress-page">
      <p className="dict-lead">Как меняется ваш словарный запас.</p>
      {error ? (
        <p className="notice">{error}</p>
      ) : metrics ? (
        <WordProgress metrics={metrics} />
      ) : (
        <p className="caption">Загружаем прогресс…</p>
      )}
    </div>
  )
}
