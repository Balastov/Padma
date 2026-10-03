import type { User } from '../../../api'
import { fullName } from '../../../api'
import './lexicon.css'

export default function ProgressStubPage({ students }: { students: User[] }) {
  const sample = students[0]
  return (
    <div className="lexicon">
      <p className="lexicon-lead">
        Смотрите, как ученики продвигаются, и вовремя поддерживайте повторение.
      </p>
      <div className="lexicon-toolbar">
        <select defaultValue={sample?.id || ''}>
          <option value="">Ученик</option>
          {students.map((s) => (
            <option key={s.id} value={s.id}>
              {fullName(s)}
            </option>
          ))}
        </select>
        <select defaultValue="all">
          <option value="all">Все группы</option>
        </select>
        <select defaultValue="4w">
          <option value="4w">Последние 4 недели</option>
        </select>
        <select defaultValue="all">
          <option value="all">Все источники</option>
        </select>
      </div>
      <div className="lexicon-stats">
        {[
          ['Освоено слов', '—'],
          ['Закрепляется', '—'],
          ['Новые слова', '—'],
          ['Серия дней', '—'],
        ].map(([label, value]) => (
          <div key={label} className="glass-panel lexicon-stub-note">
            <small>{label}</small>
            <strong>{value}</strong>
            <span className="caption">данные появятся позже</span>
          </div>
        ))}
      </div>
      <div className="lexicon-grid-2">
        <section className="glass-panel lexicon-panel lexicon-stub-note">
          <h2>Активность в изучении слов</h2>
          <p className="caption">
            График активности учеников — заглушка. Реальная аналитика будет
            подключена, когда накопится история тренировок на сервере.
          </p>
          <div
            style={{
              height: 180,
              borderRadius: 16,
              background:
                'linear-gradient(180deg, #536cff22, transparent), repeating-linear-gradient(90deg, #6375b418 0 12px, transparent 12px 28px)',
            }}
          />
        </section>
        <section className="glass-panel lexicon-panel lexicon-stub-note">
          <h2>Успешность по типам упражнений</h2>
          <ul className="lexicon-list">
            {['Понимание', 'Вспоминание', 'Аудирование', 'Написание'].map(
              (name) => (
                <li key={name}>
                  <div
                    style={{
                      width: '100%',
                      padding: '12px 14px',
                      borderRadius: 14,
                      background: '#fff',
                      border: '1px solid #6375b424',
                    }}
                  >
                    <strong>{name}</strong>
                    <div
                      style={{
                        marginTop: 8,
                        height: 8,
                        borderRadius: 999,
                        background: '#6375b422',
                      }}
                    >
                      <div
                        style={{
                          width: '40%',
                          height: '100%',
                          borderRadius: 999,
                          background: 'var(--gradient-primary)',
                        }}
                      />
                    </div>
                  </div>
                </li>
              ),
            )}
          </ul>
        </section>
      </div>
    </div>
  )
}
