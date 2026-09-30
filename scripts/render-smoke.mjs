/**
 * End-to-end smoke test: renders the dashboard page and every result component
 * with a real `/api/github` payload through Vite's SSR pipeline.
 *
 * It catches the class of bug unit tests miss — bad props, crashes inside
 * render, unsafe README markup — without needing a browser.
 *
 * Usage: npm run smoke:render   (needs network access for the GitHub fixtures;
 * without it the script falls back to a small synthetic payload)
 */
import { createServer } from 'vite'
import React from 'react'
import { renderToString } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'

const ROOT = new URL('..', import.meta.url).pathname
const USERNAME = process.env.SMOKE_USERNAME ?? 'sindresorhus'

const fallbackPayload = {
  user: {
    login: 'octocat',
    id: 1,
    avatar_url: 'https://avatars.githubusercontent.com/u/583231',
    name: 'The Octocat',
    bio: 'Fallback fixture',
    location: 'San Francisco',
    company: '@github',
    blog: 'https://github.blog',
    twitter_username: 'github',
    hireable: true,
    type: 'User',
    public_repos: 8,
    public_gists: 8,
    followers: 16000,
    following: 9,
    created_at: '2011-01-25T18:44:36Z',
    timezone: 'America/Los_Angeles',
  },
  repos: [
    {
      id: 1,
      name: 'hello-world',
      full_name: 'octocat/hello-world',
      html_url: 'https://github.com/octocat/hello-world',
      description: 'My first repository',
      language: 'JavaScript',
      stargazers_count: 2,
      forks_count: 1,
      watchers_count: 2,
      open_issues_count: 0,
      created_at: '2011-01-26T19:01:12Z',
      updated_at: '2024-01-01T00:00:00Z',
      pushed_at: '2024-01-01T00:00:00Z',
      fork: false,
      archived: false,
      is_template: false,
      default_branch: 'master',
      homepage: null,
      topics: ['demo'],
      license: { spdx_id: 'MIT', name: 'MIT License' },
    },
  ],
  events: [
    {
      id: '1',
      type: 'PushEvent',
      repo: { name: 'octocat/hello-world' },
      created_at: '2024-01-01T00:00:00Z',
      payload: { size: 2, ref: 'refs/heads/main', commits: [{ sha: 'abc', message: 'Fallback commit' }] },
    },
  ],
  profileReadme: {
    exists: true,
    contentHtml: '<h1>Hi 👋</h1><img src="https://github.com/octocat/octocat/raw/HEAD/header.gif">',
    sourceUrl: 'https://github.com/octocat/octocat#readme',
    updatedAt: null,
  },
  locationInsight: {
    location: 'San Francisco',
    timezone: 'America/Los_Angeles',
    inferredFromLocation: true,
    source: 'location-heuristic',
  },
  achievements: [
    { key: 'followers-100', label: 'Community Magnet', description: 'Reached 100 followers.', earned: true, progress: '16000/100 followers' },
  ],
  contributions: [
    {
      year: new Date().getUTCFullYear(),
      totalContributions: 12,
      maxContributionsOnDay: 4,
      longestStreak: 3,
      activeDays: 5,
      days: Array.from({ length: 20 }, (_, index) => ({
        date: `2024-01-${String((index % 28) + 1).padStart(2, '0')}`,
        contributionCount: index % 5,
        level: index % 5,
      })),
      monthlyTotals: [{ month: 'Jan', total: 12 }],
    },
  ],
  loadedContributionYears: [new Date().getUTCFullYear()],
  availableContributionYears: [new Date().getUTCFullYear() - 1, new Date().getUTCFullYear()],
  warnings: [],
  pagination: {
    repos: { limit: 30, fetched: 1, hasMore: false, maxLimit: 500 },
    events: { limit: 30, fetched: 1, hasMore: false, maxLimit: 300 },
    years: { limit: 5, fetched: 1, hasMore: false, maxLimit: 20 },
  },
  rateLimit: { remaining: 4999, resetAt: null, limited: false },
}

const server = await createServer({
  root: ROOT,
  configFile: `${ROOT}vite.config.ts`,
  server: { middlewareMode: true },
  appType: 'custom',
  logLevel: 'error',
})

const load = async (path) => (await server.ssrLoadModule(path)).default

const failures = []
const check = (condition, message) => {
  if (!condition) failures.push(message)
}

try {
  /** @type {typeof fallbackPayload} */
  let payload = fallbackPayload
  let source = 'fallback fixture'

  try {
    const handler = await load('/api/github.ts')
    const request = new Request(
      `https://example.com/api/github?username=${USERNAME}&reposLimit=40&eventsLimit=30&yearsLimit=3`
    )
    const response = await handler(request)
    const live = await response.json()
    if (response.ok && live.user) {
      payload = live
      source = `${response.status} from live GitHub (${USERNAME})`
    } else {
      check(false, `live fixture failed: HTTP ${response.status} ${live.message ?? ''}`)
    }
  } catch (error) {
    check(false, `live fixture threw: ${error.message}`)
  }

  console.log(`Fixture: ${source}`)
  console.log(
    `  ${payload.repos.length} repos · ${payload.events.length} events · ${payload.contributions.length} contribution years`
  )

  const Index = await load('/src/pages/Index.tsx')
  const emptyHtml = renderToString(React.createElement(MemoryRouter, null, React.createElement(Index)))
  check(emptyHtml.length > 500, 'Index empty state rendered too little markup')
  console.log(`✓ Index (empty state): ${emptyHtml.length} chars`)

  const year =
    payload.contributions.find((entry) => entry.year === new Date().getUTCFullYear()) ??
    payload.contributions[0]

  const cases = [
    [
      'GitHubProfile',
      '/src/components/GitHubProfile.tsx',
      { user: payload.user },
    ],
    [
      'GitHubInsights',
      '/src/components/GitHubInsights.tsx',
      {
        user: payload.user,
        profileReadmeHtml: payload.profileReadme?.contentHtml ?? null,
        profileReadmeSourceUrl: payload.profileReadme?.sourceUrl ?? null,
        achievements: payload.achievements ?? [],
        locationInsight: payload.locationInsight,
        contributionSummary: year ?? null,
        selectedYear: year?.year ?? new Date().getUTCFullYear(),
        availableYears: payload.availableContributionYears ?? [],
        loadedYears: payload.loadedContributionYears ?? [],
        onSelectYear: () => {},
        yearsLoading: false,
      },
    ],
    [
      'RepositoryList',
      '/src/components/RepositoryList.tsx',
      {
        repositories: payload.repos,
        hasMore: payload.pagination?.repos?.hasMore ?? false,
        totalFetched: payload.pagination?.repos?.fetched ?? payload.repos.length,
        onLoadMore: () => {},
      },
    ],
    [
      'ContributionActivity',
      '/src/components/ContributionActivity.tsx',
      {
        events: payload.events,
        hasMore: payload.pagination?.events?.hasMore ?? false,
        onLoadMore: () => {},
      },
    ],
    ['LanguageBreakdown', '/src/components/LanguageBreakdown.tsx', { repositories: payload.repos }],
    [
      'StatsOverview',
      '/src/components/StatsOverview.tsx',
      { user: payload.user, repositories: payload.repos, contributions: payload.contributions },
    ],
  ]

  const rendered = new Map()
  for (const [name, path, props] of cases) {
    const Component = await load(path)
    const html = renderToString(React.createElement(Component, props))
    rendered.set(name, html)
    check(html.length > 40, `${name} rendered almost nothing`)
    check(!/<script/i.test(html), `${name} rendered a <script> tag`)
    check(!/\son[a-z]+=/i.test(html), `${name} rendered an inline event handler`)
    console.log(`✓ ${name}: ${html.length} chars`)
  }

  if (year) {
    check(rendered.get('GitHubInsights').includes('Daily calendar'), 'contribution calendar missing')
    check(rendered.get('GitHubInsights').includes('Monthly totals'), 'monthly totals missing')
  }
  check(rendered.get('RepositoryList').includes('Filter by name'), 'repository filters missing')
  check(rendered.get('LanguageBreakdown').includes('conic-gradient'), 'language donut missing')
} finally {
  await server.close()
}

if (failures.length > 0) {
  console.error('\n✗ Smoke test failures:')
  for (const failure of failures) console.error(`  - ${failure}`)
  process.exit(1)
}

console.log('\n✓ All components rendered with real data')
