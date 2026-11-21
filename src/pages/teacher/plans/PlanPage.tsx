import { useCallback, useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  BookOpen,
  CheckCircle2,
  Clock3,
  FileText,
  Languages,
  Paperclip,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react'
import {
  ApiError,
  api,
  dateKey,
  friendlyDate,
  fullName,
  isManager,
  moscowToday,
} from '../../../api'
import type { User } from '../../../api'
import Modal from '../../../components/Modal'
import { wordsCount } from '../../../components/lexiconFormat'
import { lessonsLabel } from './planTypes'
import type { Plan, PlanBlock, PlanStep } from './planTypes'
import './plans.css'

const slotText = (slot: { date: string; start: string }) =>
  `${friendlyDate(slot.date)}, ${slot.start}`

/** Editor of a program or of a student's plan. */
export default function PlanPage({
  user,
  users,
}: {
  user: User
  users: User[]
}) {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const [plan, setPlan] = useState<Plan | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [title, setTitle] = useState('')
  const [blockTitle, setBlockTitle] = useState('')
  const [removing, setRemoving] = useState(false)

  const show = useCallback((next: Plan) => {
    setPlan(next)
    setTitle(next.title)
    setError('')
  }, [])
  useEffect(() => {
    let active = true
    api<Plan>(`/plans/${id}`)
      .then((next) => active && show(next))
      .catch((e: Error) => active && setError(e.message))
    return () => {
      active = false
    }
  }, [id, show])

  async function act(action: () => Promise<Plan>) {
    setBusy(true)
    try {
      show(await action())
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  if (!plan)
    return (
      <div className="plans">
        <Link className="plans-back" to="/teacher/plans">
          <ArrowLeft size={16} aria-hidden="true" /> Планы обучения
        </Link>
        {error ? (
          <p className="error" role="alert">
            {error}
          </p>
        ) : (
          <p role="status">Загружаем план…</p>
        )}
      </div>
    )

  const student = users.find((u) => u.id === plan.studentId)
  const steps = plan.blocks.flatMap((b) => b.lessons)
  const passed = steps.filter((s) => s.issue).length
  const edit = plan.canEdit

  async function addBlock(e: FormEvent) {
    e.preventDefault()
    await act(() =>
      api<Plan>(`/plans/${plan?.id}/blocks`, 'POST', { title: blockTitle }),
    )
    setBlockTitle('')
  }
  async function remove() {
    setBusy(true)
    try {
      await api(`/plans/${plan?.id}`, 'DELETE')
      navigate('/teacher/plans')
    } catch (e) {
      setError((e as Error).message)
      setBusy(false)
    }
  }

  return (
    <div className="plans">
      <Link className="plans-back" to="/teacher/plans">
        <ArrowLeft size={16} aria-hidden="true" /> Планы обучения
      </Link>
      <header className="glass-panel plans-head">
        <p className="eyebrow">
          {plan.studentId ? `ПЛАН УЧЕНИКА · ${fullName(student)}` : 'ПРОГРАММА'}
        </p>
        {edit ? (
          <form
            className="plans-inline"
            onSubmit={(e) => {
              e.preventDefault()
              void act(() =>
                api<Plan>(`/plans/${plan.id}`, 'PATCH', { title }),
              )
            }}
          >
            <label className="field">
              <span className="sr-only">Название</span>
              <input
                className="plans-head__title"
                required
                maxLength={200}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </label>
            {title !== plan.title && (
              <button className="button-primary button-small" disabled={busy}>
                Сохранить название
              </button>
            )}
          </form>
        ) : (
          <h1>{plan.title}</h1>
        )}
        <p className="secondary">
          {lessonsLabel(steps.length)}
          {plan.studentId && ` · пройдено ${passed}`}
        </p>
        {plan.studentId ? (
          <StartDate plan={plan} busy={busy} onSave={act} />
        ) : (
          <AssignPanel
            plan={plan}
            students={users.filter(
              (u) =>
                u.roles.includes('student') &&
                (isManager(user) || u.teacherId === user.id),
            )}
          />
        )}
        {!edit && (
          <p className="caption">
            Программу меняет её автор или администратор. Назначить её своему
            ученику можно: у ученика будет своя копия.
          </p>
        )}
      </header>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      {plan.blocks.map((block, index) => (
        <BlockCard
          key={block.id}
          plan={plan}
          block={block}
          first={index === 0}
          last={index === plan.blocks.length - 1}
          busy={busy}
          act={act}
        />
      ))}
      {!plan.blocks.length && (
        <p className="secondary plans-empty">
          {edit
            ? 'Начните с блока: например «Unit 1. Знакомство». Уроки добавляются внутрь блоков.'
            : 'В программе пока нет уроков.'}
        </p>
      )}
      {edit && (
        <form className="glass-panel plans-add" onSubmit={addBlock}>
          <label className="field">
            <span>Новый блок</span>
            <input
              maxLength={200}
              value={blockTitle}
              placeholder={`Блок ${plan.blocks.length + 1}`}
              onChange={(e) => setBlockTitle(e.target.value)}
            />
          </label>
          <button className="button-secondary" disabled={busy}>
            <Plus size={18} aria-hidden="true" /> Добавить блок
          </button>
        </form>
      )}
      {edit && (
        <div className="plans-danger">
          <button
            type="button"
            className="button-danger button-small"
            onClick={() => setRemoving(true)}
          >
            <Trash2 size={16} aria-hidden="true" />
            {plan.studentId ? 'Удалить план ученика' : 'Удалить программу'}
          </button>
        </div>
      )}
      {removing && (
        <Modal titleId="plan-remove" onClose={() => setRemoving(false)}>
          <h2 id="plan-remove">
            {plan.studentId ? 'Удалить план ученика?' : 'Удалить программу?'}
          </h2>
          <p className="secondary">
            {plan.studentId
              ? 'План перестанет выдавать задания. Уже выданные задания останутся у ученика.'
              : 'Планы, уже назначенные ученикам, останутся — это их копии.'}
          </p>
          <div className="form-actions">
            <button
              className="button-danger"
              disabled={busy}
              onClick={() => void remove()}
            >
              Удалить
            </button>
            <button
              className="button-secondary"
              autoFocus
              onClick={() => setRemoving(false)}
            >
              Отмена
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}

function StartDate({
  plan,
  busy,
  onSave,
}: {
  plan: Plan
  busy: boolean
  onSave: (action: () => Promise<Plan>) => Promise<void>
}) {
  const [date, setDate] = useState(plan.startDate)
  return (
    <form
      className="plans-inline"
      onSubmit={(e) => {
        e.preventDefault()
        void onSave(() =>
          api<Plan>(`/plans/${plan.id}`, 'PATCH', { startDate: date }),
        )
      }}
    >
      <label className="field">
        <span>Уроки считаются с</span>
        <input
          type="date"
          required
          value={date}
          disabled={!plan.canEdit}
          onChange={(e) => setDate(e.target.value)}
        />
        <small>
          Урок плана — очередной проведённый урок ученика. Отменённые уроки,
          неявки и уроки с отметкой «Урок вне плана» не считаются. Задание
          выдаётся после окончания урока, срок — до следующего урока.
        </small>
      </label>
      {date !== plan.startDate && (
        <button className="button-primary button-small" disabled={busy}>
          Сохранить дату
        </button>
      )}
    </form>
  )
}

function AssignPanel({ plan, students }: { plan: Plan; students: User[] }) {
  const navigate = useNavigate()
  const [studentId, setStudentId] = useState('')
  const [startDate, setStartDate] = useState(dateKey(moscowToday()))
  const [replace, setReplace] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function assign(force = false) {
    setBusy(true)
    setError('')
    try {
      const created = await api<Plan>(`/plans/${plan.id}/assign`, 'POST', {
        studentId,
        startDate,
        replace: force,
      })
      navigate(`/teacher/plans/${created.id}`)
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) setReplace(e.message)
      else setError((e as Error).message)
      setBusy(false)
    }
  }

  if (!students.length)
    return <p className="caption">Чтобы назначить план, добавьте ученика.</p>
  return (
    <form
      className="plans-assign"
      onSubmit={(e) => {
        e.preventDefault()
        void assign()
      }}
    >
      <label className="field">
        <span>Ученик</span>
        <select
          required
          value={studentId}
          onChange={(e) => setStudentId(e.target.value)}
        >
          <option value="" disabled>
            Выберите ученика
          </option>
          {students.map((s) => (
            <option key={s.id} value={s.id}>
              {fullName(s)}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>Уроки считаются с</span>
        <input
          type="date"
          required
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
        />
      </label>
      <button
        className="button-primary"
        disabled={busy || !studentId || !startDate}
      >
        {busy ? 'Назначаем…' : 'Назначить ученику'}
      </button>
      <small className="caption plans-assign__hint">
        Ученик получит свою копию плана — её можно менять под него. Если урок
        в первый день уже прошёл, задание к нему выдастся сразу.
      </small>
      {error && (
        <p className="error plans-assign__hint" role="alert">
          {error}
        </p>
      )}
      {replace && (
        <Modal titleId="plan-replace" onClose={() => setReplace('')}>
          <h2 id="plan-replace">Заменить план ученика?</h2>
          <p className="secondary">
            {replace}. Он будет удалён, уже выданные задания останутся у
            ученика.
          </p>
          <div className="form-actions">
            <button
              type="button"
              className="button-primary"
              disabled={busy}
              onClick={() => {
                setReplace('')
                void assign(true)
              }}
            >
              Заменить
            </button>
            <button
              type="button"
              className="button-secondary"
              autoFocus
              onClick={() => setReplace('')}
            >
              Отмена
            </button>
          </div>
        </Modal>
      )}
    </form>
  )
}

function BlockCard({
  plan,
  block,
  first,
  last,
  busy,
  act,
}: {
  plan: Plan
  block: PlanBlock
  first: boolean
  last: boolean
  busy: boolean
  act: (action: () => Promise<Plan>) => Promise<void>
}) {
  const navigate = useNavigate()
  const [renaming, setRenaming] = useState(false)
  const [name, setName] = useState(block.title)
  const [lessonTitle, setLessonTitle] = useState('')
  const [asking, setAsking] = useState<'' | 'block' | string>('')
  const edit = plan.canEdit
  const steps = plan.blocks.flatMap((b) => b.lessons)

  async function addLesson(e: FormEvent) {
    e.preventDefault()
    try {
      const next = await api<Plan>(`/plan-blocks/${block.id}/lessons`, 'POST', {
        title: lessonTitle,
      })
      navigate(`/teacher/plans/${plan.id}/lessons/${next.createdId}`)
    } catch (err) {
      await act(() => Promise.reject(err))
    }
  }

  const stepToRemove = block.lessons.find((s) => s.id === asking)
  return (
    <section className="glass-panel plans-block">
      <div className="plans-block__head">
        {renaming ? (
          <form
            className="plans-inline"
            onSubmit={(e) => {
              e.preventDefault()
              void act(() =>
                api<Plan>(`/plan-blocks/${block.id}`, 'PATCH', { title: name }),
              ).then(() => setRenaming(false))
            }}
          >
            <label className="field">
              <span className="sr-only">Название блока</span>
              <input
                autoFocus
                required
                maxLength={200}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <button className="button-primary button-small" disabled={busy}>
              Сохранить
            </button>
            <button
              type="button"
              className="button-secondary button-small"
              onClick={() => {
                setName(block.title)
                setRenaming(false)
              }}
            >
              Отмена
            </button>
          </form>
        ) : (
          <h2>{block.title}</h2>
        )}
        {edit && !renaming && (
          <div className="plans-tools">
            <button
              type="button"
              className="icon-button"
              aria-label={`Переименовать блок «${block.title}»`}
              title="Переименовать"
              onClick={() => setRenaming(true)}
            >
              <Pencil size={17} />
            </button>
            <button
              type="button"
              className="icon-button"
              aria-label={`Блок «${block.title}» выше`}
              title="Выше"
              disabled={busy || first}
              onClick={() =>
                void act(() =>
                  api<Plan>(`/plan-blocks/${block.id}/move`, 'POST', {
                    direction: -1,
                  }),
                )
              }
            >
              <ArrowUp size={17} />
            </button>
            <button
              type="button"
              className="icon-button"
              aria-label={`Блок «${block.title}» ниже`}
              title="Ниже"
              disabled={busy || last}
              onClick={() =>
                void act(() =>
                  api<Plan>(`/plan-blocks/${block.id}/move`, 'POST', {
                    direction: 1,
                  }),
                )
              }
            >
              <ArrowDown size={17} />
            </button>
            <button
              type="button"
              className="icon-button"
              aria-label={`Удалить блок «${block.title}»`}
              title="Удалить блок"
              onClick={() => setAsking('block')}
            >
              <Trash2 size={17} />
            </button>
          </div>
        )}
      </div>
      {block.lessons.length ? (
        <ol className="plans-steps">
          {block.lessons.map((step) => (
            <StepRow
              key={step.id}
              plan={plan}
              step={step}
              busy={busy}
              firstOfPlan={step.number === 1}
              lastOfPlan={step.number === steps.length}
              act={act}
              onRemove={() => setAsking(step.id)}
            />
          ))}
        </ol>
      ) : (
        <p className="caption">В блоке пока нет уроков.</p>
      )}
      {edit && (
        <form className="plans-inline plans-block__add" onSubmit={addLesson}>
          <label className="field">
            <span className="sr-only">Название урока</span>
            <input
              required
              maxLength={200}
              value={lessonTitle}
              placeholder="Название нового урока"
              onChange={(e) => setLessonTitle(e.target.value)}
            />
          </label>
          <button
            className="button-secondary button-small"
            disabled={busy || !lessonTitle.trim()}
          >
            <Plus size={16} aria-hidden="true" /> Добавить урок
          </button>
        </form>
      )}
      {asking && (
        <Modal titleId="plan-ask" onClose={() => setAsking('')}>
          <h2 id="plan-ask">
            {stepToRemove
              ? `Удалить урок «${stepToRemove.title}»?`
              : `Удалить блок «${block.title}»?`}
          </h2>
          <p className="secondary">
            {stepToRemove
              ? 'Задание, лексика, грамматика и файлы урока будут удалены.'
              : `Вместе с блоком удалятся его уроки: ${block.lessons.length}.`}
            {plan.studentId && ' Уже выданные задания останутся у ученика.'}
          </p>
          <div className="form-actions">
            <button
              className="button-danger"
              disabled={busy}
              onClick={() => {
                const path = stepToRemove
                  ? `/plan-lessons/${stepToRemove.id}`
                  : `/plan-blocks/${block.id}`
                setAsking('')
                void act(() => api<Plan>(path, 'DELETE'))
              }}
            >
              Удалить
            </button>
            <button
              className="button-secondary"
              autoFocus
              onClick={() => setAsking('')}
            >
              Отмена
            </button>
          </div>
        </Modal>
      )}
    </section>
  )
}

function StepRow({
  plan,
  step,
  busy,
  firstOfPlan,
  lastOfPlan,
  act,
  onRemove,
}: {
  plan: Plan
  step: PlanStep
  busy: boolean
  firstOfPlan: boolean
  lastOfPlan: boolean
  act: (action: () => Promise<Plan>) => Promise<void>
  onRemove: () => void
}) {
  const words = step.lexicon.reduce((n, s) => n + s.words.length, 0)
  const move = (direction: number) =>
    void act(() =>
      api<Plan>(`/plan-lessons/${step.id}/move`, 'POST', { direction }),
    )
  const href = `/teacher/plans/${plan.id}/lessons/${step.id}`
  return (
    <li className={'plans-step' + (step.issue ? ' is-passed' : '')}>
      <span className="plans-step__number" aria-hidden="true">
        {step.issue ? <CheckCircle2 size={18} /> : step.number}
      </span>
      <div className="plans-step__body">
        <Link to={href} className="plans-step__title">
          <span className="sr-only">Урок {step.number}: </span>
          {step.title}
        </Link>
        <span className="plans-step__chips">
          {step.homework && (
            <span>
              <FileText size={14} aria-hidden="true" /> Задание
            </span>
          )}
          {!!step.files.length && (
            <span>
              <Paperclip size={14} aria-hidden="true" /> {step.files.length}
            </span>
          )}
          {!!words && (
            <span>
              <Languages size={14} aria-hidden="true" /> {wordsCount(words)}
            </span>
          )}
          {!!step.grammar.length && (
            <span>
              <BookOpen size={14} aria-hidden="true" /> Грамматика:{' '}
              {step.grammar.length}
            </span>
          )}
          {!step.homework &&
            !step.files.length &&
            !words &&
            !step.grammar.length && <span className="is-empty">Без задания</span>}
        </span>
        {plan.studentId && (
          <small className="plans-step__status">
            {step.issue ? (
              <>
                {step.issue.homeworkId ? 'Задание выдано' : 'Пройден без задания'}{' '}
                {step.issue.lesson
                  ? `после урока ${slotText(step.issue.lesson)}`
                  : new Date(step.issue.issued).toLocaleDateString('ru-RU', {
                      day: 'numeric',
                      month: 'long',
                    })}
              </>
            ) : step.lesson ? (
              <>
                <Clock3 size={13} aria-hidden="true" /> Урок{' '}
                {slotText(step.lesson)}
              </>
            ) : (
              'Урок ещё не в расписании'
            )}
          </small>
        )}
      </div>
      {plan.canEdit && (
        <div className="plans-tools">
          <button
            type="button"
            className="icon-button"
            aria-label={`Урок «${step.title}» выше`}
            title="Выше"
            disabled={busy || firstOfPlan}
            onClick={() => move(-1)}
          >
            <ArrowUp size={17} />
          </button>
          <button
            type="button"
            className="icon-button"
            aria-label={`Урок «${step.title}» ниже`}
            title="Ниже"
            disabled={busy || lastOfPlan}
            onClick={() => move(1)}
          >
            <ArrowDown size={17} />
          </button>
          <button
            type="button"
            className="icon-button"
            aria-label={`Удалить урок «${step.title}»`}
            title="Удалить"
            onClick={onRemove}
          >
            <Trash2 size={17} />
          </button>
        </div>
      )}
    </li>
  )
}
