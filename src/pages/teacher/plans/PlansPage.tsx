import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ClipboardList, Plus } from 'lucide-react'
import { api, friendlyDate, fullName } from '../../../api'
import type { User } from '../../../api'
import SectionStub from '../../../components/SectionStub'
import { blocksLabel, lessonsLabel } from './planTypes'
import type { Plan, PlanSummary } from './planTypes'
import './plans.css'

/** Programs (templates) and the students' own plans. */
export default function PlansPage({
  user,
  users,
}: {
  user: User
  users: User[]
}) {
  const navigate = useNavigate()
  const [plans, setPlans] = useState<PlanSummary[] | null>(null)
  const [title, setTitle] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    api<PlanSummary[]>('/plans')
      .then(setPlans)
      .catch((e: Error) => setError(e.message))
  }, [])

  async function create(e: FormEvent) {
    e.preventDefault()
    if (!title.trim()) return
    setBusy(true)
    setError('')
    try {
      const plan = await api<Plan>('/plans', 'POST', { title })
      navigate(`/teacher/plans/${plan.id}`)
    } catch (err) {
      setError((err as Error).message)
      setBusy(false)
    }
  }

  const programs = (plans || []).filter((p) => !p.studentId)
  const personal = (plans || []).filter((p) => p.studentId)
  const name = (id: string | null) => fullName(users.find((u) => u.id === id))

  return (
    <div className="plans">
      <header className="page-heading">
        <div>
          <h1>Планы обучения</h1>
          <p>
            Программа состоит из блоков и уроков. Назначенный ученику план сам
            выдаёт домашнее задание после каждого проведённого урока.
          </p>
        </div>
      </header>
      <form className="glass-panel plans-create" onSubmit={create}>
        <label className="field">
          <span>Новая программа</span>
          <input
            required
            maxLength={200}
            value={title}
            placeholder="Название программы, например «General English A2»"
            onChange={(e) => setTitle(e.target.value)}
          />
        </label>
        <button className="button-primary" disabled={busy || !title.trim()}>
          <Plus size={18} aria-hidden="true" />
          {busy ? 'Создаём…' : 'Создать программу'}
        </button>
      </form>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {plans && !plans.length && (
        <SectionStub
          icon={ClipboardList}
          title="Программ пока нет"
          text="Создайте программу, добавьте блоки и уроки, затем назначьте её ученику."
        />
      )}
      {!!personal.length && (
        <section className="plans-section">
          <h2>Планы учеников</h2>
          <div className="plans-grid">
            {personal.map((p) => (
              <Link
                key={p.id}
                to={`/teacher/plans/${p.id}`}
                className="glass-panel plans-card"
              >
                <span className="plans-card__eyebrow">{name(p.studentId)}</span>
                <strong>{p.title}</strong>
                <span
                  className="plans-progress"
                  role="img"
                  aria-label={`Пройдено ${p.passed} из ${p.lessonCount}`}
                >
                  <span
                    style={{
                      width: `${p.lessonCount ? (p.passed / p.lessonCount) * 100 : 0}%`,
                    }}
                  />
                </span>
                <small>
                  Пройдено {p.passed} из {lessonsLabel(p.lessonCount)} · с{' '}
                  {friendlyDate(p.startDate)}
                </small>
              </Link>
            ))}
          </div>
        </section>
      )}
      {!!programs.length && (
        <section className="plans-section">
          <h2>Программы</h2>
          <div className="plans-grid">
            {programs.map((p) => (
              <Link
                key={p.id}
                to={`/teacher/plans/${p.id}`}
                className="glass-panel plans-card"
              >
                <strong>{p.title}</strong>
                <small>
                  {blocksLabel(p.blockCount)} · {lessonsLabel(p.lessonCount)}
                </small>
                {p.authorId !== user.id && (
                  <small>Автор: {name(p.authorId)}</small>
                )}
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
