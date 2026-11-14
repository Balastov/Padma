import { ChevronDown } from 'lucide-react'
import { pushSupported } from '../notifications'
import './NotificationHelp.css'

const appleMobile = () =>
  /iPhone|iPad|iPod/.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
const standalone = () =>
  window.matchMedia?.('(display-mode: standalone)').matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true

function permissionText() {
  if (!pushSupported())
    return appleMobile() && !standalone()
      ? 'На iPhone и iPad уведомления работают только в приложении Padma с экрана «Домой» — см. инструкцию ниже.'
      : 'Этот браузер не поддерживает уведомления. Попробуйте Chrome, Яндекс Браузер, Edge, Firefox или Safari.'
  switch (Notification.permission) {
    case 'granted':
      return 'Браузер разрешает уведомления от Padma.'
    case 'denied':
      return 'Браузер блокирует уведомления от Padma. Снимите запрет по инструкции ниже.'
    default:
      return 'Браузер ещё не спрашивал разрешения: отметьте «Уведомления» и сохраните профиль.'
  }
}

/** How to unblock notifications; collapsed until the user opens it. */
export default function NotificationHelp({
  open,
  onToggle,
}: {
  open: boolean
  onToggle: (open: boolean) => void
}) {
  const blocked = pushSupported() && Notification.permission === 'denied'
  return (
    <div className="notify-help">
      <p className={`notify-help__status${blocked ? ' is-blocked' : ''}`}>
        {permissionText()}
      </p>
      <details open={open} onToggle={(e) => onToggle(e.currentTarget.open)}>
        <summary>
          Как разрешить уведомления, если браузер их блокирует
          <ChevronDown size={18} aria-hidden="true" />
        </summary>
        <div className="notify-help__body">
          <section>
            <h3>Chrome, Яндекс Браузер, Edge на компьютере</h3>
            <ol>
              <li>
                Нажмите на значок слева от адреса padma.ru (замок или «Настройки
                сайта»).
              </li>
              <li>
                В строке «Уведомления» выберите «Разрешить» и обновите страницу.
              </li>
            </ol>
            <p>
              Если такой строки нет: настройки браузера → «Конфиденциальность и
              безопасность» → «Настройки сайтов» → «Уведомления» → уберите
              padma.ru из списка запрещённых.
            </p>
          </section>
          <section>
            <h3>Firefox</h3>
            <ol>
              <li>Нажмите на замок слева от адреса.</li>
              <li>
                Уберите запрет «Отправлять уведомления» (крестик рядом) и
                обновите страницу.
              </li>
            </ol>
            <p>
              Или: «Настройки» → «Приватность и защита» → «Разрешения» →
              «Уведомления» → «Параметры».
            </p>
          </section>
          <section>
            <h3>Safari на Mac</h3>
            <p>
              Safari → «Настройки» → «Веб-сайты» → «Уведомления» → для padma.ru
              выберите «Разрешить».
            </p>
          </section>
          <section>
            <h3>Android</h3>
            <p>
              В Chrome: ⋮ → «Настройки» → «Настройки сайтов» → «Уведомления» →
              padma.ru → «Разрешить».
            </p>
            <p>
              Если Padma установлена на главный экран: удерживайте значок Padma
              → «О приложении» → «Уведомления» → включите.
            </p>
          </section>
          <section>
            <h3>iPhone и iPad</h3>
            <ol>
              <li>
                Откройте padma.ru в Safari → «Поделиться» → «На экран „Домой“».
              </li>
              <li>
                Запустите Padma с нового значка, войдите и включите уведомления
                здесь, в профиле.
              </li>
            </ol>
            <p>
              Если вы раньше запретили уведомления: «Настройки» iPhone →
              «Уведомления» → Padma → включите «Допуск уведомлений». Нужна iOS
              16.4 или новее.
            </p>
          </section>
          <section>
            <h3>Всё разрешено, но уведомлений нет</h3>
            <p>
              Проверьте системные настройки: в Windows — «Параметры» → «Система»
              → «Уведомления», в macOS — «Системные настройки» → «Уведомления»;
              уведомления браузера должны быть включены, а режим «Не беспокоить»
              или «Фокусирование» — выключен.
            </p>
          </section>
          <p className="notify-help__final">
            Затем вернитесь сюда, отметьте «Уведомления» и нажмите «Сохранить изменения».
          </p>
        </div>
      </details>
    </div>
  )
}
