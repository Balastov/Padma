import { APP_VERSION } from '../version'
import './Logo.css'

type LogoProps = {
  size?: 'md' | 'lg'
  showTagline?: boolean
  /** Off where the version is shown elsewhere (the menu shows it at the bottom). */
  showVersion?: boolean
}

/** Brand block as in the brand image: symbol above the wordmark and slogan. */
export default function Logo({
  size = 'md',
  showTagline = true,
  showVersion = true,
}: LogoProps) {
  return (
    <div className={`logo logo--${size}`}>
      <img
        src="/brand/padma-logo-symbol.webp"
        width="256"
        height="256"
        alt=""
        aria-hidden="true"
      />
      <div className="logo__text">
        <strong className="logo__wordmark">Padma</strong>
        {showTagline && (
          <>
            <span className="logo__tagline">
              Учиться вместе. Видеть больше.
            </span>
            {showVersion && (
              <span className="logo__version">v{APP_VERSION}</span>
            )}
          </>
        )}
      </div>
    </div>
  )
}
