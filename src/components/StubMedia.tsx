import './StubMedia.css'

export default function StubMedia({
  label = 'Обложка',
  tall,
}: {
  label?: string
  tall?: boolean
}) {
  return (
    <div
      className={'stub-media' + (tall ? ' stub-media--tall' : '')}
      role="img"
      aria-label={`${label} (заглушка)`}
    >
      <span className="stub-media__mark">Заглушка</span>
    </div>
  )
}
