const GITHUB_API_BASE_URL = 'https://api.github.com'
const REQUEST_TIMEOUT_MS = 15_000
const CACHE_CONTROL_HEADER = 's-maxage=60, stale-while-revalidate=300'

const GITHUB_MAX_PER_PAGE = 100
const DEFAULT_REPOS_LIMIT = 30
const MAX_REPOS_LIMIT = 500
const DEFAULT_EVENTS_LIMIT = 30
// GitHub caps the events feed at 300 total items across 10 pages of 30.
const MAX_EVENTS_LIMIT = 300
const EVENTS_PER_PAGE = 30

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
  contributionYears: number[]
  contributionCalendar: {
    totalContributions: number
    weeks: GitHubContributionWeek[]
    months: {
      firstDay: string
      totalWeeks: number
    }[]
  }
}

type GitHubUserContributionsResponse = {
  data?: {
    user?: {
      contributionsCollection?: GitHubContributionsCollection
    } | null
  }
  errors?: { message?: string }[]
}

type GitHubReadmeMetadata = {
  html_url?: string
}

type RateLimitInfo = {
  remaining: number | null
  resetAt: string | null
  resetAtMs: number | null
  limited: boolean
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

const parseRateLimitInfo = (response: Response): RateLimitInfo => {
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

const mergeRateLimits = (limits: RateLimitInfo[]): RateLimitInfo => {
  const remainings = limits
    .map((limit) => limit.remaining)
    .filter((value): value is number => typeof value === 'number')
  const resetMsValues = limits
    .map((limit) => limit.resetAtMs)
    .filter((value): value is number => typeof value === 'number')

  const remaining = remainings.length > 0 ? Math.min(...remainings) : null
  // When we're rate-limited we want the soonest reset; otherwise the latest is fine for display.
  const resetMs = resetMsValues.length > 0 ? Math.min(...resetMsValues) : null

  return {
    remaining,
    resetAt: resetMs === null ? null : new Date(resetMs).toISOString(),
    resetAtMs: resetMs,
    limited: remaining !== null && remaining <= 0,
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

const parseIntParam = (raw: string | null, fallback: number, min: number, max: number) => {
  if (!raw) return fallback
  const parsed = Number.parseInt(raw, 10)
  if (!Number.isFinite(parsed)) return fallback
  return Math.min(Math.max(parsed, min), max)
}

type PaginatedFetchResult<T> = {
  items: T[]
  rateLimits: RateLimitInfo[]
  warning: string | null
  truncated: boolean
  totalFetched: number
}

const fetchPaginated = async <T>(
  buildPath: (page: number, perPage: number) => string,
  endpointLabel: string,
  signal: AbortSignal,
  limit: number,
  perPageCap: number
): Promise<PaginatedFetchResult<T>> => {
  const items: T[] = []
  const rateLimits: RateLimitInfo[] = []
  let warning: string | null = null
  let truncated = false

  const effectiveLimit = Math.max(limit, 0)
  const perPage = Math.min(perPageCap, GITHUB_MAX_PER_PAGE)
  const maxPages = Math.max(1, Math.ceil(effectiveLimit / perPage))

  for (let page = 1; page <= maxPages; page += 1) {
    const response = await githubRequest(buildPath(page, perPage), signal)
    const rateLimit = parseRateLimitInfo(response)
    rateLimits.push(rateLimit)

    if (!response.ok) {
      warning = await buildEndpointWarning(endpointLabel, response, rateLimit)
      break
    }

    let payload: unknown
    try {
      payload = await response.json()
    } catch {
      warning = `Loaded profile, but ${endpointLabel} returned an unexpected response.`
      break
    }

    if (!Array.isArray(payload)) break

    const pageItems = payload as T[]
    const remainingSlots = effectiveLimit - items.length
    if (remainingSlots <= 0) {
      if (pageItems.length > 0) truncated = true
      break
    }

    if (pageItems.length > remainingSlots) {
      items.push(...pageItems.slice(0, remainingSlots))
      truncated = true
      break
    }

    items.push(...pageItems)
    if (pageItems.length < perPage) break
  }

  return { items, rateLimits, warning, truncated, totalFetched: items.length }
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
  sydney: 'Australia/Sydney',
  melbourne: 'Australia/Melbourne',
  auckland: 'Pacific/Auckland',
  dubai: 'Asia/Dubai',
  cairo: 'Africa/Cairo',
}

const inferTimezoneFromLocation = (location: string | null | undefined) => {
  if (!location) return null
  const normalized = location.toLowerCase().replace(/[^a-z]/g, '')
  if (!normalized) return null

  for (const [token, timezone] of Object.entries(LOCATION_TO_TIMEZONE)) {
    if (normalized.includes(token.toLowerCase().replace(/[^a-z]/g, ''))) {
      return timezone
    }
  }

  return null
}

const calculateLongestStreak = (days: { date: string; count: number }[]) => {
  let longestStreak = 0
  let currentStreak = 0

  for (const day of days) {
    if (day.count > 0) {
      currentStreak += 1
      longestStreak = Math.max(longestStreak, currentStreak)
    } else {
      currentStreak = 0
    }
  }

  return longestStreak
}

const buildAchievements = (user: {
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
  const accountYears =
    user.created_at ? Math.max(0, new Date().getFullYear() - new Date(user.created_at).getFullYear()) : 0

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
      progress: `${accountYears}/5 years`,
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

const queryContributions = async (
  username: string,
  signal: AbortSignal
): Promise<GitHubContributionsCollection | null> => {
  if (!process.env.GITHUB_TOKEN) {
    return null
  }

  const headers = new Headers({
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
    'User-Agent': 'git-dashboard-vercel-proxy',
    'Content-Type': 'application/json',
  })

  const query = `
    query ($login: String!) {
      user(login: $login) {
        contributionsCollection {
          contributionYears
          contributionCalendar {
            totalContributions
            weeks {
              contributionDays {
                date
                contributionCount
              }
            }
          }
        }
      }
    }
  `

  const response = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      query,
      variables: { login: username },
    }),
    signal,
  })

  if (!response.ok) {
    return null
  }

  const payload = (await response.json()) as GitHubUserContributionsResponse
  if (payload.errors && payload.errors.length > 0) {
    return null
  }

  return payload.data?.user?.contributionsCollection || null
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

  if (!username) {
    return jsonResponse(
      {
        message: 'Please provide a GitHub username.',
        errorCode: 'bad_request',
      },
      400,
      'no-store'
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
        'no-store'
      )
    }

    if (!userResponse.ok) {
      const isUserMissing = userResponse.status === 404
      const fallback = isUserMissing
        ? `GitHub user "${username}" was not found.`
        : 'Unable to load GitHub profile.'

      return jsonResponse(
        {
          message: await parseGitHubErrorMessage(userResponse, fallback),
          errorCode: isUserMissing ? 'user_not_found' : 'github_error',
          rateLimit: userRateLimit,
        },
        isUserMissing ? 404 : 502,
        'no-store'
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

    const [reposResult, eventsResult, profileReadmeResponse, profileReadmeMetaResponse, contributionsCollection] =
      await Promise.all([
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
        githubRequest(
          `/repos/${encodedUsername}/${encodedUsername}/readme`,
          timeoutController.signal
        ),
        queryContributions(username, timeoutController.signal),
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
      let sourceUrl: string | null = `https://github.com/${username}/${username}#readme`
      if (profileReadmeMetaResponse.ok) {
        try {
          const meta = (await profileReadmeMetaResponse.json()) as GitHubReadmeMetadata
          if (typeof meta.html_url === 'string' && meta.html_url.length > 0) {
            sourceUrl = meta.html_url
          }
        } catch {
          // Ignore metadata parse errors; keep fallback URL.
        }
      }

      profileReadme = {
        exists: renderedHtml.trim().length > 0,
        contentHtml: renderedHtml,
        sourceUrl,
        updatedAt: null,
      }
    } else if (profileReadmeResponse.status !== 404) {
      warnings.push(await buildEndpointWarning('profile README', profileReadmeResponse, readmeRateLimit))
    }

    const contributionsByYear = new Map<
      number,
      {
        totalContributions: number
        maxContributionsOnDay: number
        longestStreak: number
        days: { date: string; contributionCount: number; level: number }[]
      }
    >()

    if (contributionsCollection) {
      for (const yearEntry of contributionsCollection.contributionYears) {
        contributionsByYear.set(yearEntry, {
          totalContributions: 0,
          maxContributionsOnDay: 0,
          longestStreak: 0,
          days: [],
        })
      }

      const allDays = contributionsCollection.contributionCalendar.weeks.flatMap(
        (week) => week.contributionDays || []
      )

      for (const day of allDays) {
        const year = new Date(day.date).getUTCFullYear()
        const existing = contributionsByYear.get(year)
        if (!existing) {
          contributionsByYear.set(year, {
            totalContributions: 0,
            maxContributionsOnDay: 0,
            longestStreak: 0,
            days: [],
          })
        }
        const target = contributionsByYear.get(year)
        if (!target) continue
        target.days.push({
          date: day.date,
          contributionCount: day.contributionCount,
          level: day.contributionCount <= 0 ? 0 : day.contributionCount <= 2 ? 1 : day.contributionCount <= 5 ? 2 : day.contributionCount <= 9 ? 3 : 4,
        })
      }

      for (const [year, value] of contributionsByYear) {
        value.days.sort((a, b) => (a.date < b.date ? -1 : 1))
        value.totalContributions = value.days.reduce((sum, day) => sum + day.contributionCount, 0)
        value.maxContributionsOnDay = value.days.reduce(
          (max, day) => Math.max(max, day.contributionCount),
          0
        )
        value.longestStreak = calculateLongestStreak(
          value.days.map((day) => ({ date: day.date, count: day.contributionCount }))
        )
        contributionsByYear.set(year, value)
      }
    }

    const contributionYears = Array.from(contributionsByYear.entries())
      .map(([year, data]) => ({
        year,
        totalContributions: data.totalContributions,
        longestStreak: data.longestStreak,
        maxContributionsOnDay: data.maxContributionsOnDay,
        days: data.days,
        monthlyTotals: Array.from(
          data.days.reduce((map, day) => {
            const month = new Date(day.date).toLocaleDateString('en-US', { month: 'short' })
            map.set(month, (map.get(month) || 0) + day.contributionCount)
            return map
          }, new Map<string, number>())
        ).map(([month, total]) => ({ month, total })),
      }))
      .sort((a, b) => b.year - a.year)

    const filteredContributionYears = Number.isInteger(selectedYear)
      ? contributionYears.filter((item) => item.year === selectedYear)
      : contributionYears

    const aggregatedRateLimit = mergeRateLimits([
      userRateLimit,
      reposRateLimit,
      eventsRateLimit,
      readmeRateLimit,
    ])
    const { remaining, resetAt } = aggregatedRateLimit

    if (typeof remaining === 'number' && remaining > 0 && remaining <= 3) {
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
      repos: reposResult.items,
      events: eventsResult.items,
      profileReadme,
      locationInsight,
      achievements,
      contributions: filteredContributionYears,
      availableContributionYears: contributionYears.map((item) => item.year),
      warnings,
      pagination: {
        repos: {
          limit: reposLimit,
          fetched: reposResult.totalFetched,
          hasMore: reposResult.truncated,
          maxLimit: MAX_REPOS_LIMIT,
        },
        events: {
          limit: eventsLimit,
          fetched: eventsResult.totalFetched,
          hasMore: eventsResult.truncated,
          maxLimit: MAX_EVENTS_LIMIT,
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
        'no-store'
      )
    }

    return jsonResponse(
      {
        message: 'Unable to load GitHub data right now. Please try again shortly.',
        errorCode: 'proxy_error',
      },
      500,
      'no-store'
    )
  } finally {
    clearTimeout(timeoutId)
  }
}
