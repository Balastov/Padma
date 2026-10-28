import { Compass } from 'lucide-react'
import SectionStub from '../../components/SectionStub'

export default function PathPage() {
  return (
    <div className="path-page">
      <header className="page-heading">
        <div>
          <h1>Мой путь</h1>
          <p>Куда вы двигаетесь в обучении.</p>
        </div>
      </header>
      <SectionStub
        icon={Compass}
        title="Раздел скоро появится"
        text="Здесь будут ваш уровень, учебная цель и этапы обучения."
      />
    </div>
  )
}
