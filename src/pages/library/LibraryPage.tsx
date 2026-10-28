import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { Library } from 'lucide-react'
import { api } from '../../api'
import type { LibraryItem } from '../../api'
import SectionStub from '../../components/SectionStub'
import { FileLinks } from '../../components/Attachments'
import './Library.css'

export default function LibraryPage() {
  const [items, setItems] = useState<LibraryItem[] | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    api<LibraryItem[]>('/library')
      .then(setItems)
      .catch((e) => setError(e.message))
  }, [])
  return (
    <div className="library-page">
      <header className="page-heading">
        <div>
          <h1>Библиотека</h1>
          <p>Учебные материалы, доступные вам.</p>
        </div>
      </header>
      {error && <p className="error">{error}</p>}
      {items && !items.length && (
        <SectionStub
          icon={Library}
          title="Материалов пока нет"
          text="Здесь появятся учебные материалы от вашего учителя."
        />
      )}
      {!!items?.length && (
        <div className="library-list">
          {items.map((item) => (
            <article key={item.id} className="glass-panel library-card">
              <strong>{item.title}</strong>
              {item.description && (
                <p className="secondary">{item.description}</p>
              )}
              <FileLinks files={item.file ? [item.file] : []} />
            </article>
          ))}
        </div>
      )}
    </div>
  )
}

// Separate material pages are not used: old links lead to the library.
export function LibraryMaterialPage() {
  return <Navigate to="/library" replace />
}
