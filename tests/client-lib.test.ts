import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  buildContributionCalendar,
  currentStreakEndingOn,
  intensityClass,
  summarizeContributions,
} from '../src/lib/contributions.ts'
import { formatRelativeTime, getUtcWeekday, shiftDateKey, todayKey } from '../src/lib/dates.ts'
import { formatCompactNumber, normaliseUrl, pluralize } from '../src/lib/format.ts'
import { languageDonutGradient, summarizeLanguages } from '../src/lib/languages.ts'
import { sanitizeReadmeHtml, stripDangerousHtml } from '../src/lib/readme.ts'

const day = (date: string, contributionCount: number, level = contributionCount > 0 ? 2 : 0) => ({
  date,
  contributionCount,
  level,
})

test('calendar weeks start on Sunday in UTC regardless of the local timezone', () => {
  // 2024-01-01 is a Monday; 2023-12-31 is a Sunday.
  const days = [day('2023-12-31', 1), day('2024-01-01', 2), day('2024-01-06', 3), day('2024-01-07', 4)]
  const calendar = buildContributionCalendar(days, '2024-06-01')

  // Dec 31 2023 (Sun) .. Jan 6 2024 (Sat) is one calendar week.
  assert.equal(calendar.weeks.length, 2)
  assert.equal(calendar.weeks[0].key, '2023-12-31')
  assert.equal(calendar.weeks[0].days[0]?.date, '2023-12-31')
  assert.equal(calendar.weeks[0].days[1]?.date, '2024-01-01')
  assert.equal(calendar.weeks[0].days[6]?.date, '2024-01-06')
  assert.equal(calendar.weeks[1].days[0]?.date, '2024-01-07')
  // Empty slots stay null so the grid keeps a fixed 7-row shape.
  assert.equal(calendar.weeks[1].days[1], null)
})

test('calendar marks days after today as future (no coloured cells)', () => {
  const calendar = buildContributionCalendar([day('2026-01-01', 5), day('2026-12-31', 5)], '2026-06-01')
  const cells = calendar.weeks.flatMap((week) => week.days).filter(Boolean)
  const future = cells.filter((cell) => cell?.isFuture)

  assert.equal(future.length, 1)
  assert.equal(future[0]?.date, '2026-12-31')
  assert.equal(future[0]?.level, 0)
})

test('month labels only appear where the month changes', () => {
  const days = Array.from({ length: 60 }, (_, index) => {
    const key = new Date(Date.UTC(2024, 0, 1 + index)).toISOString().slice(0, 10)
    return day(key, 1)
  })
  const calendar = buildContributionCalendar(days, '2024-06-01')
  const labels = calendar.monthLabels.map((entry) => entry.label)

  assert.deepEqual(labels, ['Jan', 'Feb'])
})

test('currentStreakEndingOn keeps yesterday alive and ignores future gaps', () => {
  const days = [day('2024-05-01', 1), day('2024-05-02', 4), day('2024-05-03', 0), day('2024-05-04', 2)]

  assert.equal(currentStreakEndingOn(days, '2024-05-04'), 1)
  // Today is empty, so the streak is anchored to yesterday.
  assert.equal(currentStreakEndingOn(days, '2024-05-05'), 1)
  assert.equal(currentStreakEndingOn([day('2024-05-01', 1), day('2024-05-02', 1)], '2024-05-02'), 2)
  assert.equal(currentStreakEndingOn([], '2024-05-02'), 0)
})

test('summarizeContributions reports totals, streaks and busiest buckets', () => {
  const days = [
    day('2024-01-01', 1), // Mon
    day('2024-01-02', 5), // Tue
    day('2024-01-03', 0), // Wed
    day('2024-01-08', 2), // Mon
  ]
  const summary = summarizeContributions(days, '2024-01-09')

  assert.equal(summary.totalContributions, 8)
  assert.equal(summary.activeDays, 3)
  assert.equal(summary.longestStreak, 2)
  assert.equal(summary.currentStreak, 1)
  assert.equal(summary.averagePerActiveDay, 2.7)
  // Mon 1 + 2 = 3 contributions, Tue 5 -> Tuesday wins.
  assert.equal(summary.busiestWeekday?.label, 'Tue')
  assert.equal(summary.busiestWeekday?.total, 5)
  assert.equal(summary.busiestMonth?.label, 'Jan')
  assert.equal(summarizeContributions([], '2024-01-09').busiestWeekday, null)
})

test('intensityClass clamps out-of-range levels', () => {
  assert.equal(intensityClass(0), 'bg-[#161b22] border border-[#30363d]')
  assert.equal(intensityClass(4), 'bg-emerald-400')
  assert.equal(intensityClass(99), 'bg-emerald-400')
  assert.equal(intensityClass(-3), 'bg-[#161b22] border border-[#30363d]')
})

test('date helpers stay in UTC', () => {
  assert.equal(getUtcWeekday('2024-01-01'), 1)
  assert.equal(getUtcWeekday('nope'), null)
  assert.equal(shiftDateKey('2023-12-31', 1), '2024-01-01')
  assert.equal(shiftDateKey('2024-03-01', -1), '2024-02-29')
  assert.match(todayKey(), /^\d{4}-\d{2}-\d{2}$/)
})

test('formatRelativeTime never reports a negative age', () => {
  const now = Date.UTC(2024, 5, 1, 12, 0, 0)
  assert.equal(formatRelativeTime(new Date(now - 30_000).toISOString(), now), 'just now')
  assert.equal(formatRelativeTime(new Date(now - 5 * 60_000).toISOString(), now), '5m ago')
  assert.equal(formatRelativeTime(new Date(now - 3 * 3_600_000).toISOString(), now), '3h ago')
  assert.equal(formatRelativeTime(new Date(now - 26 * 3_600_000).toISOString(), now), 'yesterday')
  assert.equal(formatRelativeTime(new Date(now - 10 * 86_400_000).toISOString(), now), '10d ago')
  assert.equal(formatRelativeTime(new Date(now + 86_400_000).toISOString(), now), 'Jun 2, 2024')
  assert.equal(formatRelativeTime(null, now), 'unknown')
})

test('number and url formatting', () => {
  assert.equal(formatCompactNumber(999), '999')
  assert.equal(formatCompactNumber(1_200), '1.2k')
  assert.equal(formatCompactNumber(12_400), '12k')
  assert.equal(formatCompactNumber(2_500_000), '2.5M')
  assert.equal(pluralize(1, 'commit'), '1 commit')
  assert.equal(pluralize(3, 'commit'), '3 commits')
  assert.equal(normaliseUrl('example.com'), 'https://example.com')
  assert.equal(normaliseUrl('http://example.com'), 'http://example.com')
  assert.equal(normaliseUrl('  '), null)
})

test('summarizeLanguages excludes forks and computes shares', () => {
  const repos = [
    { language: 'TypeScript', stargazers_count: 10, fork: false },
    { language: 'TypeScript', stargazers_count: 0, fork: false },
    { language: 'Rust', stargazers_count: 90, fork: false },
    { language: 'Rust', stargazers_count: 500, fork: true },
    { language: null, stargazers_count: 0, fork: false },
  ]

  const stats = summarizeLanguages(repos)
  assert.equal(stats.length, 2)
  assert.equal(stats[0].language, 'TypeScript')
  assert.equal(stats[0].repos, 2)
  assert.ok(Math.abs(stats[0].percentage - 200 / 3) < 1e-9)
  assert.equal(stats[1].language, 'Rust')
  assert.equal(stats[1].stars, 90)

  const withForks = summarizeLanguages(repos, true)
  assert.equal(withForks[0].language, 'Rust')
  assert.equal(withForks[0].stars, 590)
  assert.match(languageDonutGradient(stats), /^conic-gradient\(/)
  assert.equal(languageDonutGradient([]), 'conic-gradient(#21262d 0 100%)')
})

test('stripDangerousHtml removes executable markup (no DOMParser fallback)', () => {
  const dirty = '<p>hi</p><script>alert(1)</script><a href="javascript:alert(2)">x</a><img src="x.png" onerror="alert(3)">'
  const clean = stripDangerousHtml(dirty)

  assert.ok(!clean.includes('<script'))
  assert.ok(!clean.includes('javascript:'))
  assert.ok(!clean.includes('onerror'))
  assert.ok(clean.includes('<p>hi</p>'))
})

test('sanitizeReadmeHtml falls back gracefully when DOMParser is unavailable', () => {
  // Node has no DOMParser, which is exactly the documented fallback path.
  const result = sanitizeReadmeHtml('<img src="a.png" onload="evil()">')
  assert.equal(result, '<img src="a.png">')
  assert.equal(sanitizeReadmeHtml(''), null)
  assert.equal(sanitizeReadmeHtml(null), null)
})
