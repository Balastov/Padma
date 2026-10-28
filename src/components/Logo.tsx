import './Logo.css'

type LogoProps = {
  size?: 'md' | 'lg'
  showTagline?: boolean
}

/** Brand block as in the brand image: symbol above the wordmark and slogan. */
export default function Logo({ size = 'md', showTagline = true }: LogoProps) {
  return (
    <div className={`logo logo--${size}`}>
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
