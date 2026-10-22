import { test } from 'node:test'
import assert from 'node:assert/strict'
import { addDays, isTimeZone, localDay } from './timezone.mjs'

test('local days follow the student time zone', () => {
  // 22:30 in Moscow is already the next day in Vladivostok.
  const moment = new Date('2026-10-22T19:30:00Z')
  assert.equal(localDay(moment, 'Europe/Moscow'), '2026-10-22')
  assert.equal(localDay(moment, 'Asia/Vladivostok'), '2026-10-23')
  assert.equal(localDay(moment, 'America/New_York'), '2026-10-22')
  assert.equal(localDay(moment, 'bad zone'), '2026-10-22')
  assert.equal(localDay(moment), '2026-10-22')
})

test('time zone names are validated', () => {
  assert(isTimeZone('Europe/Moscow'))
  assert(isTimeZone('America/Argentina/Buenos_Aires'))
  assert(isTimeZone('UTC'))
  for (const bad of ['', 'Mars/Olympus', 'Europe/Moscow ', 7, null, 'a'.repeat(70)])
    assert(!isTimeZone(bad))
})

test('day keys shift across months and DST changes', () => {
  assert.equal(addDays('2026-10-31', 1), '2026-11-01')
  assert.equal(addDays('2026-03-01', -1), '2026-02-28')
  assert.equal(addDays('2026-10-25', 1), '2026-10-26')
})
