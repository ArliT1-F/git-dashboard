import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  buildContributionYear,
  buildContributionYearsQuery,
  calculateLongestStreak,
  calculateStreakEndingOn,
  contributionLevel,
  fetchPaginated,
  inferTimezoneFromLocation,
  parseIntParam,
  rewriteReadmeUrls,
} from '../api/github.ts'

test('parseIntParam clamps, ignores junk and respects fallbacks', () => {
  assert.equal(parseIntParam('42', 30, 1, 500), 42)
  assert.equal(parseIntParam('0', 30, 1, 500), 1)
  assert.equal(parseIntParam('9999', 30, 1, 500), 500)
  assert.equal(parseIntParam('abc', 30, 1, 500), 30)
  assert.equal(parseIntParam('12abc', 30, 1, 500), 30)
  assert.equal(parseIntParam('', 30, 1, 500), 30)
  assert.equal(parseIntParam(null, 30, 1, 500), 30)
  assert.equal(parseIntParam('-5', 30, 1, 500), 30)
})

test('contributionLevel buckets match the GitHub scale', () => {
  assert.equal(contributionLevel(0), 0)
  assert.equal(contributionLevel(1), 1)
  assert.equal(contributionLevel(3), 2)
  assert.equal(contributionLevel(7), 3)
  assert.equal(contributionLevel(25), 4)
})

test('streak helpers are calendar aware', () => {
  const days = [
    { date: '2024-03-01', count: 1 },
    { date: '2024-03-02', count: 1 },
    { date: '2024-03-03', count: 0 },
    { date: '2024-03-04', count: 2 },
    { date: '2024-03-05', count: 3 },
    { date: '2024-03-06', count: 4 },
    { date: '2024-03-20', count: 1 },
  ]
  assert.equal(calculateLongestStreak(days), 3)
  // A gap (Mar 7 -> Mar 20) must break the streak instead of extending it.
  const gapped = [
    { date: '2024-03-05', count: 1 },
    { date: '2024-03-20', count: 1 },
  ]
  assert.equal(calculateLongestStreak(gapped), 1)
  assert.equal(calculateLongestStreak([]), 0)

  assert.equal(calculateStreakEndingOn(days, '2024-03-20'), 1)
  assert.equal(calculateStreakEndingOn(days, '2024-03-06'), 3)
  // An empty "today" keeps yesterday's streak alive.
  assert.equal(calculateStreakEndingOn(days, '2024-03-21'), 1)
  assert.equal(calculateStreakEndingOn([], '2024-03-21'), 0)
})

test('buildContributionYear derives totals, streaks and monthly buckets', () => {
  const days = [
    { date: '2024-01-01', contributionCount: 2 },
    { date: '2024-01-02', contributionCount: 4 },
    { date: '2024-12-31', contributionCount: 1 },
    // A day belonging to another year must be dropped, not silently merged.
    { date: '2023-06-01', contributionCount: 99 },
  ]

  const summary = buildContributionYear(2024, days)

  assert.equal(summary.year, 2024)
  assert.equal(summary.days.length, 3)
  assert.equal(summary.totalContributions, 7)
  assert.equal(summary.maxContributionsOnDay, 4)
  assert.equal(summary.longestStreak, 2)
  assert.equal(summary.activeDays, 3)
  assert.equal(summary.monthlyTotals.length, 12)
  assert.equal(summary.monthlyTotals[0].month, 'Jan')
  assert.equal(summary.monthlyTotals[0].total, 6)
  assert.equal(summary.monthlyTotals[11].total, 1)
  assert.equal(summary.monthlyTotals[6].total, 0)
  // Days must be chronological for streak maths.
  assert.deepEqual(
    summary.days.map((day) => day.date),
    ['2024-01-01', '2024-01-02', '2024-12-31']
  )
})

test('buildContributionYearsQuery aliases every requested year', () => {
  const query = buildContributionYearsQuery([2025, 2024])
  assert.match(query, /year0: contributionsCollection\(from: "2025-01-01T00:00:00Z", to: "2025-12-31T23:59:59Z"\)/)
  assert.match(query, /year1: contributionsCollection\(from: "2024-01-01T00:00:00Z", to: "2024-12-31T23:59:59Z"\)/)
  assert.match(query, /contributionYears/)
})

test('inferTimezoneFromLocation prefers the most specific token', () => {
  assert.equal(inferTimezoneFromLocation('San Francisco, CA'), 'America/Los_Angeles')
  assert.equal(inferTimezoneFromLocation('New York, USA'), 'America/New_York')
  assert.equal(inferTimezoneFromLocation('Bengaluru, India'), 'Asia/Kolkata')
  assert.equal(inferTimezoneFromLocation('Nowhere Land'), null)
  assert.equal(inferTimezoneFromLocation(null), null)
})

test('rewriteReadmeUrls absolutises relative assets and links', () => {
  const html = [
    '<img src="header.gif" alt="hi">',
    '<a href="docs/setup.md">setup</a>',
    '<a href="#section">jump</a>',
    '<img src="https://example.com/remote.png">',
    '<img srcset="one.png 1x, ./two.png 2x">',
    '<a href="/sindresorhus/awesome">awesome</a>',
  ].join('\n')

  const rewritten = rewriteReadmeUrls(html, 'sindresorhus')

  assert.match(rewritten, /src="https:\/\/github\.com\/sindresorhus\/sindresorhus\/raw\/HEAD\/header\.gif"/)
  assert.match(rewritten, /href="https:\/\/github\.com\/sindresorhus\/sindresorhus\/blob\/HEAD\/docs\/setup\.md"/)
  assert.match(rewritten, /href="#section"/)
  assert.match(rewritten, /src="https:\/\/example\.com\/remote\.png"/)
  assert.match(
    rewritten,
    /srcset="https:\/\/github\.com\/sindresorhus\/sindresorhus\/raw\/HEAD\/one\.png 1x, https:\/\/github\.com\/sindresorhus\/sindresorhus\/raw\/HEAD\/two\.png 2x"/
  )
  assert.match(rewritten, /href="https:\/\/github\.com\/sindresorhus\/awesome"/)
})

type FakeRepo = { id: number }

const jsonPage = (items: unknown[]) =>
  new Response(JSON.stringify(items), {
    status: 200,
    headers: { 'content-type': 'application/json', 'x-ratelimit-remaining': '4999' },
  })

test('fetchPaginated stops early when GitHub has no more pages', async () => {
  const requestedUrls: string[] = []
  const originalFetch = globalThis.fetch
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString()
    requestedUrls.push(url)
    const page = new URL(url).searchParams.get('page')
    return jsonPage(page === '1' ? Array.from({ length: 100 }, (_, i) => ({ id: i })) : [])
  }) as typeof fetch

  try {
    const result = await fetchPaginated<FakeRepo>(
      (page, perPage) => `/users/octocat/repos?per_page=${perPage}&page=${page}`,
      'repositories',
      new AbortController().signal,
      250,
      100
    )
    assert.equal(result.items.length, 100)
    assert.equal(result.hasMore, false)
    assert.equal(result.warning, null)
    assert.equal(requestedUrls.length, 2)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('fetchPaginated reports hasMore when the last page is exactly full', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = (async () =>
    jsonPage(Array.from({ length: 100 }, (_, i) => ({ id: i })))) as typeof fetch

  try {
    const result = await fetchPaginated<FakeRepo>(
      (page, perPage) => `/users/octocat/repos?per_page=${perPage}&page=${page}`,
      'repositories',
      new AbortController().signal,
      100,
      100
    )
    // Regression: this used to be `false`, hiding the "load more" button even
    // though the account had more repositories.
    assert.equal(result.items.length, 100)
    assert.equal(result.hasMore, true)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('fetchPaginated truncates large pages and keeps hasMore', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = (async () =>
    jsonPage(Array.from({ length: 100 }, (_, i) => ({ id: i })))) as typeof fetch

  try {
    const result = await fetchPaginated<FakeRepo>(
      (page, perPage) => `/users/octocat/repos?per_page=${perPage}&page=${page}`,
      'repositories',
      new AbortController().signal,
      30,
      100
    )
    assert.equal(result.items.length, 30)
    assert.equal(result.hasMore, true)
    assert.equal(result.totalFetched, 30)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('fetchPaginated surfaces upstream failures as warnings', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ message: 'Not Found' }), {
      status: 404,
      headers: { 'content-type': 'application/json', 'x-ratelimit-remaining': '10' },
    })) as typeof fetch

  try {
    const result = await fetchPaginated<FakeRepo>(
      (page, perPage) => `/users/octocat/repos?per_page=${perPage}&page=${page}`,
      'repositories',
      new AbortController().signal,
      30,
      100
    )
    assert.equal(result.items.length, 0)
    assert.equal(result.hasMore, false)
    assert.match(String(result.warning), /repositories is unavailable/)
  } finally {
    globalThis.fetch = originalFetch
  }
})
