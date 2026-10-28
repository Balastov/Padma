import type { LucideIcon } from 'lucide-react'
import './SectionStub.css'

type Props = {
  icon: LucideIcon
  title: string
  text: string
}

/** Placeholder for a student section that has no real content yet. */
export default function SectionStub({ icon: Icon, title, text }: Props) {
  return (
    <section className="glass-panel section-stub">
      <span className="section-stub__icon" aria-hidden="true">
        <Icon size={28} />
      </span>
      <h2>{title}</h2>
      <p className="secondary">{text}</p>
    </section>
  )
}
