/**
 * Date helpers for GitHub data.
 *
 * GitHub always sends `YYYY-MM-DD` (calendar) and ISO timestamps (events).
 * `new Date('2024-01-01')` is parsed as **UTC midnight**, while `getDay()`,
 * `getDate()` and friends read the *local* timezone — that combination shifts
 * every calendar cell by a day for anyone west of UTC. Everything below stays
 * in UTC (or works on the raw string) to keep the contribution grid aligned.
 */

export const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/

export type DateParts = { year: number; month: number; day: number }

export const parseDateKey = (dateKey: string): DateParts | null => {
  if (!DATE_KEY_PATTERN.test(dateKey)) return null
  const [year, month, day] = dateKey.split('-').map((part) => Number.parseInt(part, 10))
  if (!year || !month || !day) return null
  return { year, month, day }
}

/** UTC timestamp for a `YYYY-MM-DD` key (null when malformed). */
export const dateKeyToUtcTime = (dateKey: string): number | null => {
  const parts = parseDateKey(dateKey)
  if (!parts) return null
  return Date.UTC(parts.year, parts.month - 1, parts.day)
}

/** Formats a UTC timestamp back into a `YYYY-MM-DD` key. */
export const utcTimeToDateKey = (utcTime: number) => new Date(utcTime).toISOString().slice(0, 10)

/** Weekday index (0 = Sunday) in UTC, resilient to invalid input. */
export const getUtcWeekday = (dateKey: string) => {
  const utcTime = dateKeyToUtcTime(dateKey)
  return utcTime === null ? null : new Date(utcTime).getUTCDay()
}

export const shiftDateKey = (dateKey: string, days: number) => {
  const utcTime = dateKeyToUtcTime(dateKey)
  if (utcTime === null) return dateKey
  return utcTimeToDateKey(utcTime + days * 86_400_000)
}

export const todayKey = () => utcTimeToDateKey(Date.now())

export const compareDateKeys = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)

export const parseTimestamp = (value: string | null | undefined): Date | null => {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

export const formatRelativeTime = (value: string | null | undefined, now = Date.now()) => {
  const date = parseTimestamp(value)
  if (!date) return 'unknown'

  const diffMs = now - date.getTime()
  if (diffMs < 0) {
    // Future timestamps (clock skew) should not read as "just now".
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }

  const minutes = Math.floor(diffMs / 60_000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`

  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`

  const days = Math.floor(hours / 24)
  if (days === 1) return 'yesterday'
  if (days < 30) return `${days}d ago`

  const months = Math.floor(days / 30)
  if (months < 12) return `${months}mo ago`

  return `${Math.floor(months / 12)}y ago`
}

export const formatShortDate = (value: string | null | undefined) => {
  const date = parseTimestamp(value)
  if (!date) return 'unknown'
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export const formatMonthYear = (value: string | null | undefined) => {
  const date = parseTimestamp(value)
  if (!date) return 'unknown'
  return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
}

export const formatFullDate = (dateKey: string) => {
  const parts = parseDateKey(dateKey)
  if (!parts) return dateKey
  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day)).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  })
}
