import type { Lesson } from './api'
const minutes = (time: string) =>
  Number(time.slice(0, 2)) * 60 + Number(time.slice(3))

// Independent teachers may teach at the same time. Keep every event visible.
export function layoutDay(lessons: Lesson[]) {
  const result: { lesson: Lesson; lane: number; lanes: number }[] = []
  let group: { lesson: Lesson; lane: number; lanes: number }[] = []
  let ends: number[] = []
  const flush = () => {
    for (const item of group) result.push({ ...item, lanes: ends.length })
    group = []
    ends = []
  }
  for (const lesson of [...lessons].sort((a, b) =>
    a.start.localeCompare(b.start),
  )) {
    const start = minutes(lesson.start)
    if (ends.length && start >= Math.max(...ends)) flush()
    let lane = ends.findIndex((end) => end <= start)
    if (lane === -1) lane = ends.length
    ends[lane] = minutes(lesson.end)
    group.push({ lesson, lane, lanes: 1 })
  }
  flush()
  return result
}
