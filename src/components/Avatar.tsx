import type { Teacher } from '../api'
export default function Avatar({
  user,
  large = false,
}: {
  user?: Teacher | null
  large?: boolean
}) {
  return user?.photo ? (
    <img
      className={`avatar${large ? ' avatar--large' : ''}`}
      src={user.photo}
      alt=""
    />
  ) : (
    <span
      className={`avatar avatar--initials${large ? ' avatar--large' : ''}`}
      aria-hidden
    >
      {user ? (user.name[0] || '') + (user.surname[0] || '') : 'P'}
    </span>
  )
}
