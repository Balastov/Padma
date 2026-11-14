/** Preset student avatars in public/avatars; the server checks the same list. */
export const PRESET_AVATARS = Array.from(
  { length: 15 },
  (_, i) => `/avatars/animal-${String(i + 1).padStart(2, '0')}.jpg`,
)
export const isPresetAvatar = (photo?: string) =>
  Boolean(photo && PRESET_AVATARS.includes(photo))
