import './Logo.css'

type LogoProps = {
  size?: 'sm' | 'md' | 'lg'
  showTagline?: boolean
  centered?: boolean
  /** Symbol above wordmark + slogan, as on the login screen. */
  stacked?: boolean
}

export default function Logo({
  size = 'md',
  showTagline = true,
  centered,
  stacked,
}: LogoProps) {
  if (stacked) {
    return (
      <div
        className={`logo logo--stacked logo--${size}${centered ? ' logo--centered' : ''}`}
      >
        <img src="/brand/padma-logo-symbol.svg" alt="" aria-hidden="true" />
        <strong className="logo__wordmark">Padma</strong>
        {showTagline && (
          <span className="logo__tagline">Учиться вместе. Видеть больше.</span>
        )}
      </div>
    )
  }

  return (
    <div className={`logo logo--${size}${centered ? ' logo--centered' : ''}`}>
      <img src="/brand/padma-logo-horizontal.svg" alt="Padma" />
      {showTagline && (
        <span className="logo__tagline">Учиться вместе. Видеть больше.</span>
      )}
    </div>
  )
}
