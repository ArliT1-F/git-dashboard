import {
  compareDateKeys,
  dateKeyToUtcTime,
  formatFullDate,
  getUtcWeekday,
  todayKey,
  utcTimeToDateKey,
} from './dates.ts'
import type { GitHubContributionDay, GitHubContributionYearSummary } from '@/types/github'

export const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const

export const MONTH_LABELS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const

export type CalendarCell = {
  date: string
  count: number
  level: number
  /** Days after "today" in the current year: rendered as empty placeholders. */
  isFuture: boolean
  label: string
}

export type CalendarWeek = {
  key: string
  days: (CalendarCell | null)[]
}

export type ContributionCalendar = {
  weeks: CalendarWeek[]
  monthLabels: { weekIndex: number; label: string }[]
}

/**
 * Lays contribution days out as GitHub does: one column per week, Sunday first.
 * All maths happens in UTC so the grid lines up in every timezone.
 */
export const buildContributionCalendar = (
  days: GitHubContributionDay[],
  referenceToday: string = todayKey()
): ContributionCalendar => {
  const sorted = [...days].sort((a, b) => compareDateKeys(a.date, b.date))
  const weeks: CalendarWeek[] = []
  let currentWeek: CalendarWeek | null = null
  let lastWeekday = -1

  for (const day of sorted) {
    const weekday = getUtcWeekday(day.date)
    const utcTime = dateKeyToUtcTime(day.date)
    if (weekday === null || utcTime === null) continue

    const isFuture = day.date > referenceToday
    const cell: CalendarCell = {
      date: day.date,
      count: day.contributionCount,
      level: isFuture ? 0 : day.level,
      isFuture,
      label: `${day.contributionCount} contribution${day.contributionCount === 1 ? '' : 's'} on ${formatFullDate(
        day.date
      )}`,
    }

    if (!currentWeek || weekday <= lastWeekday) {
      const weekStart = utcTimeToDateKey(utcTime - weekday * 86_400_000)
      currentWeek = { key: weekStart, days: Array.from({ length: 7 }, () => null) }
      weeks.push(currentWeek)
    }

    currentWeek.days[weekday] = cell
    lastWeekday = weekday
  }

  const monthLabels = weeks.map((week, weekIndex) => {
    const firstDay = week.days.find((day): day is CalendarCell => Boolean(day))
    if (!firstDay) return null
    const monthIndex = Number.parseInt(firstDay.date.slice(5, 7), 10) - 1
    return { weekIndex, label: MONTH_LABELS[monthIndex] ?? '' }
  })

  // Only keep a label where the month actually changes, and drop the first week
  // when it sits in the final days of the previous month.
  const dedupedLabels: { weekIndex: number; label: string }[] = []
  let lastLabel: string | null = null
  monthLabels.forEach((entry) => {
    if (!entry || entry.label === lastLabel) return
    if (dedupedLabels.length === 0 && entry.weekIndex === 0) {
      const week = weeks[entry.weekIndex]
      const firstDay = week.days.find((day): day is CalendarCell => Boolean(day))
      if (firstDay && firstDay.date.slice(8, 10) > '07') {
        lastLabel = entry.label
        return
      }
    }
    lastLabel = entry.label
    dedupedLabels.push(entry)
  })

  return { weeks, monthLabels: dedupedLabels }
}

export const INTENSITY_CLASSES = [
  'bg-[#161b22] border border-[#30363d]',
  'bg-emerald-900/70',
  'bg-emerald-700/80',
  'bg-emerald-500/90',
  'bg-emerald-400',
] as const

export const intensityClass = (level: number) =>
  INTENSITY_CLASSES[Math.min(Math.max(Math.round(level), 0), INTENSITY_CLASSES.length - 1)]

export type ContributionInsights = {
  activeDays: number
  currentStreak: number
  longestStreak: number
  averagePerActiveDay: number
  busiestWeekday: { label: string; total: number } | null
  busiestMonth: { label: string; total: number } | null
  totalContributions: number
}

/** Run of consecutive contribution days ending today (or yesterday, if today is empty). */
export const currentStreakEndingOn = (
  days: Pick<GitHubContributionDay, 'date' | 'contributionCount'>[],
  referenceToday: string = todayKey()
) => {
  const byDate = new Map(days.map((day) => [day.date, day.contributionCount]))
  let cursor = referenceToday

  if ((byDate.get(cursor) ?? 0) === 0) {
    const parts = dateKeyToUtcTime(cursor)
    if (parts === null) return 0
    cursor = utcTimeToDateKey(parts - 86_400_000)
  }

  let streak = 0
  let cursorTime = dateKeyToUtcTime(cursor)
  while (cursorTime !== null && (byDate.get(utcTimeToDateKey(cursorTime)) ?? 0) > 0) {
    streak += 1
    cursorTime -= 86_400_000
  }

  return streak
}

export const summarizeContributions = (
  days: GitHubContributionDay[],
  referenceToday: string = todayKey()
): ContributionInsights => {
  const weekdayTotals = Array.from({ length: 7 }, () => 0)
  const monthTotals = Array.from({ length: 12 }, () => 0)
  let activeDays = 0
  let totalContributions = 0
  let longestStreak = 0
  let run = 0
  let previousTime: number | null = null

  for (const day of [...days].sort((a, b) => compareDateKeys(a.date, b.date))) {
    const weekday = getUtcWeekday(day.date)
    const utcTime = dateKeyToUtcTime(day.date)
    if (weekday === null || utcTime === null) continue

    totalContributions += day.contributionCount
    if (day.contributionCount > 0) {
      activeDays += 1
      weekdayTotals[weekday] += day.contributionCount
      const monthIndex = Number.parseInt(day.date.slice(5, 7), 10) - 1
      if (monthIndex >= 0 && monthIndex < 12) monthTotals[monthIndex] += day.contributionCount
      run = previousTime !== null && utcTime === previousTime + 86_400_000 ? run + 1 : 1
      longestStreak = Math.max(longestStreak, run)
    } else {
      run = 0
    }
    previousTime = utcTime
  }

  const busiestWeekdayIndex = weekdayTotals.reduce(
    (best, total, index) => (total > weekdayTotals[best] ? index : best),
    0
  )
  const busiestMonthIndex = monthTotals.reduce(
    (best, total, index) => (total > monthTotals[best] ? index : best),
    0
  )

  return {
    activeDays,
    currentStreak: currentStreakEndingOn(days, referenceToday),
    longestStreak,
    averagePerActiveDay: activeDays > 0 ? Math.round((totalContributions / activeDays) * 10) / 10 : 0,
    busiestWeekday:
      weekdayTotals[busiestWeekdayIndex] > 0
        ? { label: WEEKDAY_LABELS[busiestWeekdayIndex], total: weekdayTotals[busiestWeekdayIndex] }
        : null,
    busiestMonth:
      monthTotals[busiestMonthIndex] > 0
        ? { label: MONTH_LABELS[busiestMonthIndex], total: monthTotals[busiestMonthIndex] }
        : null,
    totalContributions,
  }
}

export const yearSummaryToDays = (summary: GitHubContributionYearSummary | null) => summary?.days ?? []
