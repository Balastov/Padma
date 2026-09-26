import { Link, useParams } from 'react-router-dom'
import { seed } from '../../student/mock/seed'
import './LibraryPage.css'

export default function LibraryPage() {
  return (
    <div className="library-page">
      <header className="page-heading">
        <div>
          <h1>Библиотека</h1>
          <p>Учебные материалы, доступные вам.</p>
        </div>
      </header>
      <div className="library-page__list">
        {seed.library.map((m) => (
          <Link
            key={m.id}
            to={`/library/${m.id}`}
            className="glass-panel library-card"
          >
            <small>{m.kind}</small>
            <strong>{m.title}</strong>
            <p>{m.description}</p>
          </Link>
        ))}
      </div>
    </div>
  )
}

export function LibraryMaterialPage() {
  const { materialId } = useParams()
  const item = seed.library.find((m) => m.id === materialId)
  if (!item) return <p className="empty-state">Материал не найден.</p>
  return (
    <div className="library-material">
      <header className="page-heading">
        <div>
          <h1>{item.title}</h1>
          <p>{item.kind}</p>
        </div>
      </header>
      <section className="glass-panel" style={{ padding: 20 }}>
        <p>{item.description}</p>
        <p className="secondary">
          Полный просмотр материала появится при подключении файлов преподавателя.
        </p>
        <Link to="/library">← К библиотеке</Link>
      </section>
    </div>
  )
}
