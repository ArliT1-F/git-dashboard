const GITHUB_API_BASE_URL = 'https://api.github.com'
const GITHUB_GRAPHQL_URL = 'https://api.github.com/graphql'
const REQUEST_TIMEOUT_MS = 20_000
const CACHE_CONTROL_HEADER = 's-maxage=120, stale-while-revalidate=600'
const NO_STORE_HEADER = 'no-store'

const GITHUB_MAX_PER_PAGE = 100
const DEFAULT_REPOS_LIMIT = 30
const MAX_REPOS_LIMIT = 500
const DEFAULT_EVENTS_LIMIT = 30
// GitHub exposes ~300 public events per user and accepts up to 100 per page
// (verified against the live API), so large feeds need 3 round trips, not 10.
const MAX_EVENTS_LIMIT = 300
const EVENTS_PER_PAGE = 100

// One GraphQL request carries one alias per year, so a whole contribution
// history costs a single HTTP request (and a single rate-limit point).
// GitHub rejects (or stalls on) queries with more than ~12 contribution
// calendars, so 12 is the hard ceiling.
const DEFAULT_CONTRIBUTION_YEARS = 5
const MAX_CONTRIBUTION_YEARS = 12

const LOW_RATE_LIMIT_THRESHOLD = 3

export const config = {
  runtime: 'edge',
}

type ErrorResponse = {
  message?: string
}

type GitHubContributionDay = {
  date: string
  contributionCount: number
}

type GitHubContributionWeek = {
  contributionDays: GitHubContributionDay[]
}

type GitHubContributionsCollection = {
  contributionYears?: number[]
  contributionCalendar?: {
    totalContributions?: number
    weeks?: GitHubContributionWeek[]
  } | null
}

type GitHubUserContributionsResponse = {
  data?: {
    user?: Record<string, GitHubContributionsCollection | undefined> | null
    rateLimit?: { cost?: number; remaining?: number; resetAt?: string }
  }
  errors?: { message?: string; type?: string }[]
}

type RateLimitInfo = {
  remaining: number | null
  resetAt: string | null
  resetAtMs: number | null
  limited: boolean
}

export type ContributionDay = {
  date: string
  contributionCount: number
  level: number
}

export type ContributionYearSummary = {
  year: number
  totalContributions: number
  maxContributionsOnDay: number
  longestStreak: number
  activeDays: number
  days: ContributionDay[]
  monthlyTotals: { month: string; total: number }[]
}

export type GitHubRepoSummary = {
  id: number
  name: string
  full_name: string
  html_url: string
  description: string | null
  language: string | null
  stargazers_count: number
  forks_count: number
  watchers_count: number
  open_issues_count: number
  created_at: string | null
  updated_at: string | null
  pushed_at: string | null
  fork: boolean
  archived: boolean
  is_template: boolean
  default_branch: string | null
  homepage: string | null
  topics: string[]
  license: { spdx_id: string | null; name: string | null } | null
}

export type GitHubEventSummary = {
  id: string
  type: string
  repo: { name: string }
  created_at: string
  payload: {
    action?: string
    ref?: string
    ref_type?: string
    size?: number
    distinct_size?: number
    commits?: { sha: string; message: string }[]
    pull_request?: { number: number; title: string; merged: boolean; html_url: string }
    issue?: { number: number; title: string; html_url: string }
    forkee?: { full_name: string; html_url: string }
    release?: { tag_name: string; name: string | null; html_url: string }
  }
}

const emptyRateLimit = (): RateLimitInfo => ({
  remaining: null,
  resetAt: null,
  resetAtMs: null,
  limited: false,
})

const jsonResponse = (
  body: unknown,
  status = 200,
  cacheControl = CACHE_CONTROL_HEADER
) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': cacheControl,
    },
  })

export const parseRateLimitInfo = (response: Response): RateLimitInfo => {
  const remainingRaw = response.headers.get('x-ratelimit-remaining')
  const resetRaw = response.headers.get('x-ratelimit-reset')
  const parsedRemaining =
    typeof remainingRaw === 'string' ? Number.parseInt(remainingRaw, 10) : Number.NaN
  const parsedReset = typeof resetRaw === 'string' ? Number.parseInt(resetRaw, 10) : Number.NaN

  const remaining = Number.isNaN(parsedRemaining) ? null : parsedRemaining
  const resetMs = Number.isNaN(parsedReset) ? null : parsedReset * 1000

  return {
    remaining,
    resetAt: resetMs === null ? null : new Date(resetMs).toISOString(),
    resetAtMs: resetMs,
    limited: remaining !== null && remaining <= 0,
  }
}

export const mergeRateLimits = (limits: RateLimitInfo[]): RateLimitInfo => {
  const remainings = limits
    .map((limit) => limit.remaining)
    .filter((value): value is number => typeof value === 'number')
  const resetMsValues = limits
    .map((limit) => limit.resetAtMs)
    .filter((value): value is number => typeof value === 'number')

  const remaining = remainings.length > 0 ? Math.min(...remainings) : null
  const limited = remaining !== null && remaining <= 0
  // Rate-limited: show when the window reopens (soonest reset). Otherwise the
  // latest reset is the window we are currently counting down to.
  const resetMs =
    resetMsValues.length === 0
      ? null
      : limited
        ? Math.min(...resetMsValues)
        : Math.max(...resetMsValues)

  return {
    remaining,
    resetAt: resetMs === null ? null : new Date(resetMs).toISOString(),
    resetAtMs: resetMs,
    limited,
  }
}

// GitHub returns 403 for primary rate limits and 429 for secondary/abuse limits.
const isRateLimitedResponse = (response: Response, rateLimit: RateLimitInfo) =>
  (response.status === 403 && rateLimit.limited) ||
  response.status === 429 ||
  (response.status === 403 && response.headers.has('retry-after'))

const parseGitHubErrorMessage = async (response: Response, fallback: string) => {
  try {
    const payload = (await response.clone().json()) as ErrorResponse
    if (typeof payload?.message === 'string' && payload.message.length > 0) {
      return payload.message
    }
  } catch {
    // Ignore parse errors and use fallback.
  }

  return fallback
}

const githubRequest = async (
  path: string,
  signal: AbortSignal,
  accept = 'application/vnd.github+json'
) => {
  const headers = new Headers({
    Accept: accept,
    'User-Agent': 'git-dashboard-vercel-proxy',
    'X-GitHub-Api-Version': '2022-11-28',
  })

  if (process.env.GITHUB_TOKEN) {
    headers.set('Authorization', `Bearer ${process.env.GITHUB_TOKEN}`)
  }

  return fetch(`${GITHUB_API_BASE_URL}${path}`, {
    headers,
    signal,
  })
}

export const parseIntParam = (raw: string | null, fallback: number, min: number, max: number) => {
  if (raw === null) return fallback
  const trimmed = raw.trim()
  if (!/^\d+$/.test(trimmed)) return fallback
  const parsed = Number.parseInt(trimmed, 10)
  if (!Number.isFinite(parsed)) return fallback
  return Math.min(Math.max(parsed, min), max)
}

type PaginatedFetchResult<T> = {
  items: T[]
  rateLimits: RateLimitInfo[]
  warning: string | null
  hasMore: boolean
  totalFetched: number
}

/**
 * Walks GitHub's `page` cursor until `limit` items are collected.
 *
 * `hasMore` reports whether GitHub still holds items we have not fetched. A
 * full page at the very end of the window means "probably more" (we cannot know
 * without spending another request), so the client can keep offering "load
 * more" instead of silently truncating the list.
 */
export const fetchPaginated = async <T>(
  buildPath: (page: number, perPage: number) => string,
  endpointLabel: string,
  signal: AbortSignal,
  limit: number,
  perPageCap: number
): Promise<PaginatedFetchResult<T>> => {
  const items: T[] = []
  const rateLimits: RateLimitInfo[] = []
  let warning: string | null = null
  let hasMore = false

  const effectiveLimit = Math.max(limit, 0)
  const perPage = Math.min(perPageCap, GITHUB_MAX_PER_PAGE)
  const maxPages = Math.max(1, Math.ceil(effectiveLimit / perPage))

  for (let page = 1; page <= maxPages; page += 1) {
    let response: Response
    try {
      response = await githubRequest(buildPath(page, perPage), signal)
    } catch (error) {
      // Network/abort failures: keep whatever we already collected so the UI can
      // still render partial data.
      if (error instanceof Error && error.name === 'AbortError') throw error
      warning = `Loaded profile, but ${endpointLabel} could not be reached.`
      hasMore = items.length > 0
      break
    }

    const rateLimit = parseRateLimitInfo(response)
    rateLimits.push(rateLimit)

    if (!response.ok) {
      warning = await buildEndpointWarning(endpointLabel, response, rateLimit)
      hasMore = items.length > 0
      break
    }

    let payload: unknown
    try {
      payload = await response.json()
    } catch {
      warning = `Loaded profile, but ${endpointLabel} returned an unexpected response.`
      hasMore = items.length > 0
      break
    }

    if (!Array.isArray(payload)) {
      warning = `Loaded profile, but ${endpointLabel} returned an unexpected response.`
      hasMore = items.length > 0
      break
    }

    const pageItems = payload as T[]
    const remainingSlots = effectiveLimit - items.length

    if (pageItems.length > remainingSlots) {
      items.push(...pageItems.slice(0, remainingSlots))
      hasMore = true
      break
    }

    items.push(...pageItems)

    if (pageItems.length < perPage) {
      // GitHub ran out of data before we ran out of budget.
      hasMore = false
      break
    }

    // Full page: there are probably more items upstream.
    hasMore = true
  }

  return { items, rateLimits, warning, hasMore, totalFetched: items.length }
}

const buildEndpointWarning = async (
  endpointLabel: string,
  response: Response,
  rateLimit: RateLimitInfo
) => {
  if (isRateLimitedResponse(response, rateLimit)) {
    return `GitHub rate limit blocked ${endpointLabel}. Try again later.`
  }

  const message = await parseGitHubErrorMessage(response, `Unable to load ${endpointLabel}.`)
  return `Loaded profile, but ${endpointLabel} is unavailable right now (${response.status}): ${message}`
}

const LOCATION_TO_TIMEZONE: Record<string, string> = {
  london: 'Europe/London',
  uk: 'Europe/London',
  paris: 'Europe/Paris',
  berlin: 'Europe/Berlin',
  madrid: 'Europe/Madrid',
  lisbon: 'Europe/Lisbon',
  rome: 'Europe/Rome',
  amsterdam: 'Europe/Amsterdam',
  newyork: 'America/New_York',
  nyc: 'America/New_York',
  boston: 'America/New_York',
  toronto: 'America/Toronto',
  chicago: 'America/Chicago',
  austin: 'America/Chicago',
  denver: 'America/Denver',
  phoenix: 'America/Phoenix',
  losangeles: 'America/Los_Angeles',
  seattle: 'America/Los_Angeles',
  sf: 'America/Los_Angeles',
  sanfrancisco: 'America/Los_Angeles',
  vancouver: 'America/Vancouver',
  saopaulo: 'America/Sao_Paulo',
  buenosaires: 'America/Argentina/Buenos_Aires',
  tokyo: 'Asia/Tokyo',
  seoul: 'Asia/Seoul',
  singapore: 'Asia/Singapore',
  delhi: 'Asia/Kolkata',
  mumbai: 'Asia/Kolkata',
  bangalore: 'Asia/Kolkata',
  bengaluru: 'Asia/Kolkata',
  hyderabad: 'Asia/Kolkata',
  pune: 'Asia/Kolkata',
  sydney: 'Australia/Sydney',
  melbourne: 'Australia/Melbourne',
  brisbane: 'Australia/Brisbane',
  perth: 'Australia/Perth',
  auckland: 'Pacific/Auckland',
  dubai: 'Asia/Dubai',
  cairo: 'Africa/Cairo',
  lagos: 'Africa/Lagos',
  nairobi: 'Africa/Nairobi',
  warsaw: 'Europe/Warsaw',
  stockholm: 'Europe/Stockholm',
  oslo: 'Europe/Oslo',
  copenhagen: 'Europe/Copenhagen',
  helsinki: 'Europe/Helsinki',
  dublin: 'Europe/Dublin',
  zurich: 'Europe/Zurich',
  vienna: 'Europe/Vienna',
  prague: 'Europe/Prague',
  moscow: 'Europe/Moscow',
  istanbul: 'Europe/Istanbul',
  telaviv: 'Asia/Jerusalem',
  bangkok: 'Asia/Bangkok',
  jakarta: 'Asia/Jakarta',
  manila: 'Asia/Manila',
  hongkong: 'Asia/Hong_Kong',
  shanghai: 'Asia/Shanghai',
  beijing: 'Asia/Shanghai',
  taipei: 'Asia/Taipei',
  mexicocity: 'America/Mexico_City',
  bogota: 'America/Bogota',
  santiago: 'America/Santiago',
  lima: 'America/Lima',
}

export const inferTimezoneFromLocation = (location: string | null | undefined) => {
  if (!location) return null
  const normalized = location.toLowerCase().replace(/[^a-z]/g, '')
  if (!normalized) return null

  let bestMatch: { token: string; timezone: string } | null = null
  for (const [token, timezone] of Object.entries(LOCATION_TO_TIMEZONE)) {
    const normalizedToken = token.toLowerCase().replace(/[^a-z]/g, '')
    if (!normalizedToken || !normalized.includes(normalizedToken)) continue
    // Longest matching token wins so "sanfrancisco" beats a stray "sf" match.
    if (!bestMatch || normalizedToken.length > bestMatch.token.length) {
      bestMatch = { token: normalizedToken, timezone }
    }
  }

  return bestMatch?.timezone ?? null
}

/** Days since the Unix epoch, used to compare calendar days without timezones. */
const toDayNumber = (date: string) => {
  const [year, month, day] = date.split('-').map((part) => Number.parseInt(part, 10))
  if (!year || !month || !day) return Number.NaN
  return Date.UTC(year, month - 1, day) / 86_400_000
}

/**
 * Longest run of consecutive calendar days with at least one contribution.
 * Comparing dates (instead of array positions) keeps the maths correct even
 * when GitHub omits days from the calendar.
 */
export const calculateLongestStreak = (days: { date: string; count: number }[]) => {
  let longestStreak = 0
  let currentStreak = 0
  let previousDay: number | null = null

  for (const day of days) {
    const dayNumber = toDayNumber(day.date)
    if (day.count > 0) {
      currentStreak =
        previousDay !== null && dayNumber === previousDay + 1 ? currentStreak + 1 : 1
      longestStreak = Math.max(longestStreak, currentStreak)
    } else {
      currentStreak = 0
    }
    previousDay = dayNumber
  }

  return longestStreak
}

/** Run of consecutive contribution days ending on (or one day after) `today`. */
export const calculateStreakEndingOn = (days: { date: string; count: number }[], today: string) => {
  const todayNumber = toDayNumber(today)
  const byDay = new Map<number, number>()
  for (const day of days) {
    byDay.set(toDayNumber(day.date), day.count)
  }

  // A streak stays "alive" when today has no contributions yet, so start the
  // walk at today and step back through the previous day when it is empty.
  let cursor = todayNumber
  if ((byDay.get(cursor) ?? 0) === 0) {
    cursor -= 1
  }

  let streak = 0
  while ((byDay.get(cursor) ?? 0) > 0) {
    streak += 1
    cursor -= 1
  }

  return streak
}

export const contributionLevel = (count: number) => {
  if (count <= 0) return 0
  if (count <= 2) return 1
  if (count <= 5) return 2
  if (count <= 9) return 3
  return 4
}

const MONTH_LABELS = [
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
]

export const buildContributionYear = (
  year: number,
  rawDays: GitHubContributionDay[]
): ContributionYearSummary => {
  const days: ContributionDay[] = rawDays
    .map((day) => ({
      date: day.date,
      contributionCount: Number.isFinite(day.contributionCount) ? day.contributionCount : 0,
      level: contributionLevel(day.contributionCount),
    }))
    .filter((day) => day.date.startsWith(`${year}-`))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))

  const monthlyTotals = MONTH_LABELS.map((month, index) => ({
    month,
    total: days.reduce(
      (sum, day) => (Number(day.date.slice(5, 7)) === index + 1 ? sum + day.contributionCount : sum),
      0
    ),
  }))

  return {
    year,
    totalContributions: days.reduce((sum, day) => sum + day.contributionCount, 0),
    maxContributionsOnDay: days.reduce((max, day) => Math.max(max, day.contributionCount), 0),
    longestStreak: calculateLongestStreak(
      days.map((day) => ({ date: day.date, count: day.contributionCount }))
    ),
    activeDays: days.filter((day) => day.contributionCount > 0).length,
    days,
    monthlyTotals,
  }
}

export const buildAchievements = (user: {
  followers?: number
  public_repos?: number
  public_gists?: number
  created_at?: string
  bio?: string | null
  blog?: string | null
}) => {
  const followers = user.followers ?? 0
  const repos = user.public_repos ?? 0
  const gists = user.public_gists ?? 0
  const createdAt = user.created_at ? new Date(user.created_at) : null
  const accountYears =
    createdAt && !Number.isNaN(createdAt.getTime())
      ? Math.max(0, (Date.now() - createdAt.getTime()) / (1000 * 60 * 60 * 24 * 365.25))
      : 0

  return [
    {
      key: 'followers-100',
      label: 'Community Magnet',
      description: 'Reached 100 followers.',
      earned: followers >= 100,
      progress: `${followers}/100 followers`,
    },
    {
      key: 'repos-50',
      label: 'Builder',
      description: 'Created at least 50 public repositories.',
      earned: repos >= 50,
      progress: `${repos}/50 repositories`,
    },
    {
      key: 'gists-25',
      label: 'Snippet Archivist',
      description: 'Published at least 25 public gists.',
      earned: gists >= 25,
      progress: `${gists}/25 gists`,
    },
    {
      key: 'veteran-5y',
      label: 'GitHub Veteran',
      description: 'Has maintained an account for 5 years.',
      earned: accountYears >= 5,
      progress: `${Math.floor(accountYears)}/5 years`,
    },
    {
      key: 'profile-complete',
      label: 'Profile Completed',
      description: 'Has bio and website configured.',
      earned: Boolean(user.bio && user.blog),
      progress: user.bio && user.blog ? 'Complete' : 'Add bio + blog',
    },
  ]
}

export const buildContributionYearsQuery = (years: number[]) => {
  const aliases = years
    .map(
      (year, index) => `
      year${index}: contributionsCollection(from: "${year}-01-01T00:00:00Z", to: "${year}-12-31T23:59:59Z") {
        contributionCalendar {
          totalContributions
          weeks {
            contributionDays {
              date
              contributionCount
            }
          }
        }
      }`
    )
    .join('')

  return `
    query ($login: String!) {
      user(login: $login) {
        contributionsCollection {
          contributionYears
        }${aliases}
      }
    }
  `
}

type ContributionsResult = {
  allYears: number[]
  years: ContributionYearSummary[]
  warning: string | null
}

const queryContributions = async (
  username: string,
  years: number[],
  signal: AbortSignal,
  hasToken: boolean
): Promise<ContributionsResult> => {
  if (!hasToken) {
    return {
      allYears: [],
      years: [],
      warning:
        'Contribution history needs a GitHub token. Set GITHUB_TOKEN to unlock per-year insights.',
    }
  }

  if (years.length === 0) {
    return { allYears: [], years: [], warning: null }
  }

  const headers = new Headers({
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
    'User-Agent': 'git-dashboard-vercel-proxy',
    'Content-Type': 'application/json',
  })

  let response: Response
  try {
    response = await fetch(GITHUB_GRAPHQL_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        query: buildContributionYearsQuery(years),
        variables: { login: username },
      }),
      signal,
    })
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw error
    return { allYears: [], years: [], warning: 'Contribution history could not be reached.' }
  }

  if (!response.ok) {
    const rateLimit = parseRateLimitInfo(response)
    if (isRateLimitedResponse(response, rateLimit)) {
      return {
        allYears: [],
        years: [],
        warning: 'The GitHub GraphQL rate limit blocked contribution history. Try again later.',
      }
    }
    return {
      allYears: [],
      years: [],
      warning: `Contribution history is unavailable right now (${response.status}).`,
    }
  }

  let payload: GitHubUserContributionsResponse
  try {
    payload = (await response.json()) as GitHubUserContributionsResponse
  } catch {
    return { allYears: [], years: [], warning: 'Contribution history returned an unexpected response.' }
  }

  const user = payload.data?.user
  if (!user) {
    const message = payload.errors?.[0]?.message
    return {
      allYears: [],
      years: [],
      warning: message
        ? `Contribution history is unavailable: ${message}`
        : 'Contribution history is unavailable for this account.',
    }
  }

  const allYears = (user.contributionsCollection?.contributionYears ?? [])
    .filter((year): year is number => Number.isInteger(year))
    .sort((a, b) => b - a)

  const summaries: ContributionYearSummary[] = []
  years.forEach((year, index) => {
    const collection = user[`year${index}`] as GitHubContributionsCollection | undefined
    // A year only counts as "loaded" when GitHub actually answered for it, even
    // if the calendar itself comes back empty (a dormant account).
    if (!collection?.contributionCalendar) return
    const rawDays = (collection.contributionCalendar.weeks ?? []).flatMap(
      (week) => week.contributionDays || []
    )
    summaries.push(buildContributionYear(year, rawDays))
  })

  return {
    allYears,
    years: summaries.sort((a, b) => b.year - a.year),
    warning: null,
  }
}

const toRepoSummary = (raw: Record<string, unknown>): GitHubRepoSummary => {
  const license = raw.license as { spdx_id?: string | null; name?: string | null } | null

  return {
    id: Number(raw.id ?? 0),
    name: String(raw.name ?? ''),
    full_name: String(raw.full_name ?? ''),
    html_url: String(raw.html_url ?? ''),
    description: typeof raw.description === 'string' ? raw.description : null,
    language: typeof raw.language === 'string' ? raw.language : null,
    stargazers_count: Number(raw.stargazers_count ?? 0),
    forks_count: Number(raw.forks_count ?? 0),
    watchers_count: Number(raw.watchers_count ?? 0),
    open_issues_count: Number(raw.open_issues_count ?? 0),
    created_at: typeof raw.created_at === 'string' ? raw.created_at : null,
    updated_at: typeof raw.updated_at === 'string' ? raw.updated_at : null,
    pushed_at: typeof raw.pushed_at === 'string' ? raw.pushed_at : null,
    fork: Boolean(raw.fork),
    archived: Boolean(raw.archived),
    is_template: Boolean(raw.is_template),
    default_branch: typeof raw.default_branch === 'string' ? raw.default_branch : null,
    homepage: typeof raw.homepage === 'string' && raw.homepage.length > 0 ? raw.homepage : null,
    topics: Array.isArray(raw.topics)
      ? raw.topics.filter((topic): topic is string => typeof topic === 'string').slice(0, 12)
      : [],
    license:
      license && (license.spdx_id || license.name)
        ? {
            spdx_id: typeof license.spdx_id === 'string' ? license.spdx_id : null,
            name: typeof license.name === 'string' ? license.name : null,
          }
        : null,
  }
}

const toEventSummary = (raw: Record<string, unknown>): GitHubEventSummary => {
  const payload = (raw.payload as Record<string, unknown>) ?? {}
  const commits = Array.isArray(payload.commits)
    ? (payload.commits as Record<string, unknown>[])
        .filter((commit) => typeof commit?.message === 'string')
        .slice(0, 20)
        .map((commit) => ({
          sha: typeof commit.sha === 'string' ? commit.sha : '',
          message: String(commit.message),
        }))
    : []

  const pullRequest = payload.pull_request as Record<string, unknown> | undefined
  const issue = payload.issue as Record<string, unknown> | undefined
  const forkee = payload.forkee as Record<string, unknown> | undefined
  const release = payload.release as Record<string, unknown> | undefined

  return {
    id: String(raw.id ?? ''),
    type: String(raw.type ?? ''),
    repo: {
      name: typeof (raw.repo as Record<string, unknown>)?.name === 'string'
        ? String((raw.repo as Record<string, unknown>).name)
        : '',
    },
    created_at: String(raw.created_at ?? ''),
    payload: {
      action: typeof payload.action === 'string' ? payload.action : undefined,
      ref: typeof payload.ref === 'string' ? payload.ref : undefined,
      ref_type: typeof payload.ref_type === 'string' ? payload.ref_type : undefined,
      size: typeof payload.size === 'number' ? payload.size : undefined,
      distinct_size: typeof payload.distinct_size === 'number' ? payload.distinct_size : undefined,
      commits,
      pull_request: pullRequest
        ? {
            number: Number(pullRequest.number ?? 0),
            title: String(pullRequest.title ?? ''),
            merged: Boolean(pullRequest.merged),
            html_url: String(pullRequest.html_url ?? ''),
          }
        : undefined,
      issue: issue
        ? {
            number: Number(issue.number ?? 0),
            title: String(issue.title ?? ''),
            html_url: String(issue.html_url ?? ''),
          }
        : undefined,
      forkee: forkee
        ? { full_name: String(forkee.full_name ?? ''), html_url: String(forkee.html_url ?? '') }
        : undefined,
      release: release
        ? {
            tag_name: String(release.tag_name ?? ''),
            name: typeof release.name === 'string' ? release.name : null,
            html_url: String(release.html_url ?? ''),
          }
        : undefined,
    },
  }
}

const EXTERNAL_URL_PATTERN = /^([a-z][a-z0-9+.-]*:|\/\/)/i

/**
 * GitHub's rendered README HTML (from the `application/vnd.github.html` media
 * type) keeps *relative* asset URLs such as `src="header.gif"`. Those resolve
 * against github.com on GitHub's own pages, but break when the markup is
 * embedded somewhere else, so rewrite them to absolute URLs.
 */
export const rewriteReadmeUrls = (html: string, login: string) => {
  const repoPath = `${login}/${login}`
  const rawBase = `https://github.com/${repoPath}/raw/HEAD/`
  const blobBase = `https://github.com/${repoPath}/blob/HEAD/`

  const resolve = (value: string, kind: 'image' | 'link') => {
    const trimmed = value.trim()
    if (!trimmed || trimmed.startsWith('#') || EXTERNAL_URL_PATTERN.test(trimmed)) return value
    if (trimmed.startsWith('/')) return `https://github.com${trimmed}`
    const base = kind === 'image' ? rawBase : blobBase
    return `${base}${trimmed.replace(/^\.\//, '')}`
  }

  return html.replace(
    /(\s)(src|href|poster|data-src|srcset)="([^"]*)"/gi,
    (_match, whitespace: string, attribute: string, value: string) => {
      const name = attribute.toLowerCase()

      if (name === 'srcset') {
        const rewritten = value
          .split(',')
          .map((entry) => {
            const parts = entry.trim().split(/\s+/)
            if (parts.length === 0 || !parts[0]) return entry
            return [resolve(parts[0], 'image'), ...parts.slice(1)].join(' ')
          })
          .join(', ')
        return `${whitespace}${attribute}="${rewritten}"`
      }

      const kind: 'image' | 'link' =
        name === 'src' || name === 'poster' || name === 'data-src' ? 'image' : 'link'
      return `${whitespace}${attribute}="${resolve(value, kind)}"`
    }
  )
}

export default async function handler(request: Request) {
  const requestUrl = new URL(request.url)
  const username = requestUrl.searchParams.get('username')?.trim()
  const selectedYearParam = requestUrl.searchParams.get('year')
  const selectedYear = selectedYearParam ? Number.parseInt(selectedYearParam, 10) : null

  const reposLimit = parseIntParam(
    requestUrl.searchParams.get('reposLimit'),
    DEFAULT_REPOS_LIMIT,
    1,
    MAX_REPOS_LIMIT
  )
  const eventsLimit = parseIntParam(
    requestUrl.searchParams.get('eventsLimit'),
    DEFAULT_EVENTS_LIMIT,
    1,
    MAX_EVENTS_LIMIT
  )
  const yearsLimit = parseIntParam(
    requestUrl.searchParams.get('yearsLimit'),
    DEFAULT_CONTRIBUTION_YEARS,
    1,
    MAX_CONTRIBUTION_YEARS
  )

  if (!username) {
    return jsonResponse(
      {
        message: 'Please provide a GitHub username.',
        errorCode: 'bad_request',
      },
      400,
      NO_STORE_HEADER
    )
  }

  // Reject anything that is not a plausible GitHub login early: it keeps the
  // upstream calls predictable and avoids passing junk straight through.
  if (!/^[a-zA-Z0-9](?:[a-zA-Z0-9]|-(?=[a-zA-Z0-9])){0,38}$/.test(username)) {
    return jsonResponse(
      {
        message: `"${username}" is not a valid GitHub username.`,
        errorCode: 'invalid_username',
      },
      400,
      NO_STORE_HEADER
    )
  }

  const timeoutController = new AbortController()
  const timeoutId = setTimeout(() => timeoutController.abort(), REQUEST_TIMEOUT_MS)

  try {
    const encodedUsername = encodeURIComponent(username)
    const userResponse = await githubRequest(`/users/${encodedUsername}`, timeoutController.signal)
    const userRateLimit = parseRateLimitInfo(userResponse)

    if (isRateLimitedResponse(userResponse, userRateLimit)) {
      return jsonResponse(
        {
          message: 'GitHub API rate limit exceeded.',
          errorCode: 'rate_limited',
          rateLimit: userRateLimit,
        },
        429,
        NO_STORE_HEADER
      )
    }

    if (!userResponse.ok) {
      const isUserMissing = userResponse.status === 404
      const fallback = isUserMissing
        ? `GitHub user "${username}" was not found.`
        : 'Unable to load GitHub profile.'

      return jsonResponse(
        {
          // GitHub answers 404 with a bare "Not Found", which tells the user
          // nothing useful, so keep the descriptive fallback in that case.
          message: isUserMissing
            ? fallback
            : await parseGitHubErrorMessage(userResponse, fallback),
          errorCode: isUserMissing ? 'user_not_found' : 'github_error',
          rateLimit: userRateLimit,
        },
        isUserMissing ? 404 : 502,
        NO_STORE_HEADER
      )
    }

    const userRaw = (await userResponse.json()) as Record<string, unknown>
    const inferredTimezone = inferTimezoneFromLocation(
      typeof userRaw.location === 'string' ? userRaw.location : null
    )
    const user = {
      ...userRaw,
      timezone: inferredTimezone,
    }

    // Candidate years for the contribution calendar are derived from the
    // account creation date so a single GraphQL round trip can cover the whole
    // history window the client asked for.
    const currentYear = new Date().getUTCFullYear()
    const createdAt = typeof userRaw.created_at === 'string' ? new Date(userRaw.created_at) : null
    const createdYear =
      createdAt && !Number.isNaN(createdAt.getTime()) ? createdAt.getUTCFullYear() : currentYear
    const firstCandidateYear = Math.max(createdYear, currentYear - yearsLimit + 1)
    const candidateYears: number[] = []
    for (let year = currentYear; year >= firstCandidateYear; year -= 1) {
      candidateYears.push(year)
    }

    const [
      reposResult,
      eventsResult,
      profileReadmeResponse,
      contributionsResult,
    ] = await Promise.all([
      fetchPaginated<Record<string, unknown>>(
        (page, perPage) =>
          `/users/${encodedUsername}/repos?sort=updated&per_page=${perPage}&page=${page}`,
        'repositories',
        timeoutController.signal,
        reposLimit,
        GITHUB_MAX_PER_PAGE
      ),
      fetchPaginated<Record<string, unknown>>(
        (page, perPage) =>
          `/users/${encodedUsername}/events/public?per_page=${perPage}&page=${page}`,
        'activity events',
        timeoutController.signal,
        eventsLimit,
        EVENTS_PER_PAGE
      ),
      githubRequest(
        `/repos/${encodedUsername}/${encodedUsername}/readme`,
        timeoutController.signal,
        'application/vnd.github.html'
      ),
      queryContributions(
        username,
        candidateYears,
        timeoutController.signal,
        Boolean(process.env.GITHUB_TOKEN)
      ),
    ])

    const warnings: string[] = []

    const reposRateLimit = mergeRateLimits(reposResult.rateLimits)
    if (reposResult.warning) warnings.push(reposResult.warning)

    const eventsRateLimit = mergeRateLimits(eventsResult.rateLimits)
    if (eventsResult.warning) warnings.push(eventsResult.warning)

    const readmeRateLimit = parseRateLimitInfo(profileReadmeResponse)

    let profileReadme = {
      exists: false,
      contentHtml: null as string | null,
      sourceUrl: null as string | null,
      updatedAt: null as string | null,
    }

    if (profileReadmeResponse.ok) {
      const renderedHtml = await profileReadmeResponse.text()
      profileReadme = {
        exists: renderedHtml.trim().length > 0,
        contentHtml: renderedHtml.trim().length > 0 ? rewriteReadmeUrls(renderedHtml, username) : null,
        sourceUrl: `https://github.com/${username}/${username}#readme`,
        updatedAt: null,
      }
    } else if (profileReadmeResponse.status !== 404) {
      warnings.push(await buildEndpointWarning('profile README', profileReadmeResponse, readmeRateLimit))
    }

    if (contributionsResult.warning) warnings.push(contributionsResult.warning)

    const availableContributionYears = Array.from(
      new Set([...contributionsResult.allYears, ...candidateYears, currentYear])
    ).sort((a, b) => b - a)

    const loadedContributionYears = new Set(contributionsResult.years.map((entry) => entry.year))
    const contributionYears = Number.isInteger(selectedYear)
      ? contributionsResult.years.filter((entry) => entry.year === selectedYear)
      : contributionsResult.years

    const aggregatedRateLimit = mergeRateLimits([
      userRateLimit,
      reposRateLimit,
      eventsRateLimit,
      readmeRateLimit,
    ])
    const { remaining, resetAt } = aggregatedRateLimit

    if (
      typeof remaining === 'number' &&
      remaining > 0 &&
      remaining <= LOW_RATE_LIMIT_THRESHOLD
    ) {
      warnings.push(`GitHub API rate limit is low (${remaining} requests remaining).`)
    }

    const locationInsight = {
      location: typeof user.location === 'string' ? user.location : null,
      timezone: inferredTimezone,
      inferredFromLocation: Boolean(inferredTimezone),
      source: inferredTimezone ? 'location-heuristic' : null,
    }

    const achievements = buildAchievements({
      followers: typeof user.followers === 'number' ? user.followers : 0,
      public_repos: typeof user.public_repos === 'number' ? user.public_repos : 0,
      public_gists: typeof user.public_gists === 'number' ? user.public_gists : 0,
      created_at: typeof user.created_at === 'string' ? user.created_at : '',
      bio: typeof user.bio === 'string' ? user.bio : null,
      blog: typeof user.blog === 'string' ? user.blog : null,
    })

    return jsonResponse({
      user,
      repos: reposResult.items.map(toRepoSummary),
      events: eventsResult.items.map(toEventSummary),
      profileReadme,
      locationInsight,
      achievements,
      contributions: contributionYears,
      loadedContributionYears: Array.from(loadedContributionYears),
      availableContributionYears,
      warnings,
      pagination: {
        repos: {
          limit: reposLimit,
          fetched: reposResult.totalFetched,
          hasMore: reposResult.hasMore,
          maxLimit: MAX_REPOS_LIMIT,
        },
        events: {
          limit: eventsLimit,
          fetched: eventsResult.totalFetched,
          hasMore: eventsResult.hasMore,
          maxLimit: MAX_EVENTS_LIMIT,
        },
        years: {
          limit: yearsLimit,
          fetched: contributionYears.length,
          hasMore: availableContributionYears.some((year) => !loadedContributionYears.has(year)),
          maxLimit: MAX_CONTRIBUTION_YEARS,
        },
      },
      rateLimit: {
        remaining,
        resetAt,
        limited: remaining !== null && remaining <= 0,
      },
    })
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      return jsonResponse(
        {
          message: 'GitHub request timed out. Please try again.',
          errorCode: 'upstream_timeout',
        },
        504,
        NO_STORE_HEADER
      )
    }

    // Surfaced in the Vercel/dev logs; the client only sees a generic message.
    console.error('[api/github] request failed', error)

    return jsonResponse(
      {
        message: 'Unable to load GitHub data right now. Please try again shortly.',
        errorCode: 'proxy_error',
      },
      500,
      NO_STORE_HEADER
    )
  } finally {
    clearTimeout(timeoutId)
  }
}
