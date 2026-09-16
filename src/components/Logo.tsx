import logoMark from '../assets/logo-mark.png'
import './Logo.css'

type LogoProps = {
  size?: 'sm' | 'md' | 'lg'
  showTagline?: boolean
  centered?: boolean
}

export default function Logo({ size = 'md', showTagline = true, centered }: LogoProps) {
  return (
    <div className={`logo logo--${size}${centered ? ' logo--centered' : ''}`}>
      <img className="logo__mark" src={logoMark} alt="" />
      <div className="logo__text">
        <span className="logo__name">Padma</span>
        {showTagline && <span className="logo__tagline">Учиться вместе. Видеть больше.</span>}
      </div>
    </div>
  )
}
