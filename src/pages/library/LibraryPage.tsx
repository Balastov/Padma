import { Navigate } from 'react-router-dom'
import { Library } from 'lucide-react'
import SectionStub from '../../components/SectionStub'

export default function LibraryPage() {
  return (
    <div className="library-page">
      <header className="page-heading">
        <div>
          <h1>Библиотека</h1>
          <p>Учебные материалы, доступные вам.</p>
        </div>
      </header>
      <SectionStub
        icon={Library}
        title="Материалов пока нет"
        text="Здесь появятся учебные материалы от вашего учителя."
      />
    </div>
  )
}

// Materials are not connected yet: old links lead to the library.
export function LibraryMaterialPage() {
  return <Navigate to="/library" replace />
}
