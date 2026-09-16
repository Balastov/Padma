import { Bell, ChevronDown } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import Logo from './Logo'
import studentImg from '../assets/student.jpg'
import './Header.css'

export default function Header() {
  const navigate = useNavigate()

  return (
    <header className="header">
      <button type="button" className="header__brand" onClick={() => navigate('/dashboard')}>
        <Logo size="sm" />
      </button>

      <div className="header__actions">
        <button type="button" className="header__bell glass" aria-label="Уведомления">
          <Bell size={17} strokeWidth={1.8} />
          <span className="header__badge" />
        </button>

        <button type="button" className="header__user glass">
          <img src={studentImg} alt="" className="header__avatar" />
          <span>Аня</span>
          <ChevronDown size={15} strokeWidth={2.2} />
        </button>
      </div>
    </header>
  )
}
