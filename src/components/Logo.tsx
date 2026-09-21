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
  const classes = [
    'logo',
    stacked ? 'logo--stacked' : 'logo--inline',
    `logo--${size}`,
    centered ? 'logo--centered' : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div className={classes}>
      <img src="/brand/padma-logo-symbol.svg" alt="" aria-hidden="true" />
      <div className="logo__text">
        <strong className="logo__wordmark">Padma</strong>
        {showTagline && (
          <span className="logo__tagline">Учиться вместе. Видеть больше.</span>
        )}
      </div>
    </div>
  )
}
