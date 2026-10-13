import type { CSSProperties } from 'react'
import type { Background } from '../appearance'
import './AppBackground.css'

/** Fixed blurred photo behind the Liquid Glass surfaces. */
export default function AppBackground({
  background,
}: {
  background: Background | null
}) {
  if (!background) return null
  return (
    <div
      className="app-bg"
      aria-hidden="true"
      style={
        {
          '--app-bg-image': `url("${background.url}")`,
          '--app-bg-blur': `${background.blur}px`,
          '--app-bg-tint': background.tint / 100,
        } as CSSProperties
      }
    >
      <div className="app-bg__image" />
      <div className="app-bg__tint" />
    </div>
  )
}
