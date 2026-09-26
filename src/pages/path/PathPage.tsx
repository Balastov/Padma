import { seed } from '../../student/mock/seed'
import './PathPage.css'

export default function PathPage() {
  const { level, pathNodes } = seed
  return (
    <div className="path-page">
      <header className="page-heading">
        <div>
          <h1>Мой путь</h1>
          <p>Куда вы двигаетесь в обучении.</p>
        </div>
      </header>
      <section className="glass-panel path-level">
        <div>
          <small>Текущий уровень</small>
          <strong>{level.current}</strong>
        </div>
        <div>
          <small>Цель</small>
          <strong>{level.goal}</strong>
        </div>
        <div className="path-level__aim">
          <small>Главная учебная цель</small>
          <p>{level.aim}</p>
        </div>
      </section>
      <section className="glass-panel path-map">
        <h2>Карта развития</h2>
        <ol>
          {pathNodes.map((node) => (
            <li key={node.id} className={`path-node path-node--${node.status}`}>
              <span className="path-node__dot" />
              <div>
                <strong>{node.title}</strong>
                <small>
                  {node.status === 'done'
                    ? 'Пройдено'
                    : node.status === 'current'
                      ? 'Сейчас'
                      : 'Впереди'}
                </small>
              </div>
            </li>
          ))}
        </ol>
      </section>
    </div>
  )
}
