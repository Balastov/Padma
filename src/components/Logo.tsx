import './Logo.css'
type LogoProps = {
  size?: 'sm' | 'md' | 'lg'
  showTagline?: boolean
  centered?: boolean
}
export default function Logo({
  size = 'md',
  showTagline = true,
  centered,
}: LogoProps) {
  return (
    <div className={`logo logo--${size}${centered ? ' logo--centered' : ''}`}>
      <img src="/brand/padma-logo-horizontal.svg" alt="Padma" />
      {showTagline && <span>Учиться вместе. Видеть больше.</span>}
    </div>
  )
}
