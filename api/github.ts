const GITHUB_API_BASE_URL = 'https://api.github.com'
const REQUEST_TIMEOUT_MS = 10_000
const CACHE_CONTROL_HEADER = 's-maxage=60, stale-while-revalidate=300'

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

type GitHubContributionYear = {
  year: number
  totalContributions: number
  contributionMonths: {
    month: string
    totalContributions: number
  }[]
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

type GitHubReadmeContentResponse = {
  content?: string
  encoding?: string
  html_url?: string
}

type RateLimitInfo = {
  remaining: number | null
  resetAt: string | null
  limited: boolean
}

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

  return {
    remaining: Number.isNaN(parsedRemaining) ? null : parsedRemaining,
    resetAt: Number.isNaN(parsedReset) ? null : new Date(parsedReset * 1000).toISOString(),
    limited: !Number.isNaN(parsedRemaining) && parsedRemaining <= 0,
  }
}

const isRateLimitedResponse = (response: Response, rateLimit: RateLimitInfo) =>
  response.status === 403 && rateLimit.limited

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

const githubRequest = async (path: string, signal: AbortSignal) => {
  const headers = new Headers({
    Accept: 'application/vnd.github+json',
    'User-Agent': 'git-dashboard-vercel-proxy',
  })

  if (process.env.GITHUB_TOKEN) {
    headers.set('Authorization', `Bearer ${process.env.GITHUB_TOKEN}`)
  }

  return fetch(`${GITHUB_API_BASE_URL}${path}`, {
    headers,
    signal,
  })
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

const decodeBase64Utf8 = (base64Content: string) => {
  try {
    return decodeURIComponent(
      Array.from(atob(base64Content))
        .map((char) => `%${char.charCodeAt(0).toString(16).padStart(2, '0')}`)
        .join('')
    )
  } catch {
    return atob(base64Content)
  }
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

    const [reposResponse, eventsResponse, profileReadmeResponse, contributionsCollection] = await Promise.all([
      githubRequest(`/users/${encodedUsername}/repos?sort=updated&per_page=10`, timeoutController.signal),
      githubRequest(`/users/${encodedUsername}/events?per_page=20`, timeoutController.signal),
      githubRequest(`/repos/${encodedUsername}/${encodedUsername}/readme`, timeoutController.signal),
      queryContributions(username, timeoutController.signal),
    ])

    const reposRateLimit = parseRateLimitInfo(reposResponse)
    const eventsRateLimit = parseRateLimitInfo(eventsResponse)
    const readmeRateLimit = parseRateLimitInfo(profileReadmeResponse)
    const warnings: string[] = []

    const reposPayload: unknown = reposResponse.ok ? await reposResponse.json() : []
    if (!reposResponse.ok) {
      warnings.push(await buildEndpointWarning('repositories', reposResponse, reposRateLimit))
    }

    const eventsPayload: unknown = eventsResponse.ok ? await eventsResponse.json() : []
    if (!eventsResponse.ok) {
      warnings.push(await buildEndpointWarning('activity events', eventsResponse, eventsRateLimit))
    }

    let profileReadme = {
      exists: false,
      contentHtml: null as string | null,
      sourceUrl: null as string | null,
      updatedAt: null as string | null,
    }

    if (profileReadmeResponse.ok) {
      const readmePayload = (await profileReadmeResponse.json()) as GitHubReadmeContentResponse
      if (readmePayload.content && readmePayload.encoding === 'base64') {
        profileReadme = {
          exists: true,
          contentHtml: decodeBase64Utf8(readmePayload.content.replace(/\n/g, '')),
          sourceUrl: readmePayload.html_url || `https://github.com/${username}/${username}#readme`,
          updatedAt: null,
        }
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

    const remainingCandidates = [
      userRateLimit.remaining,
      reposRateLimit.remaining,
      eventsRateLimit.remaining,
      readmeRateLimit.remaining,
    ].filter((value): value is number => typeof value === 'number')

    const remaining = remainingCandidates.length > 0 ? Math.min(...remainingCandidates) : null
    const resetAt = userRateLimit.resetAt || reposRateLimit.resetAt || eventsRateLimit.resetAt

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
      repos: Array.isArray(reposPayload) ? reposPayload : [],
      events: Array.isArray(eventsPayload) ? eventsPayload : [],
      profileReadme,
      locationInsight,
      achievements,
      contributions: filteredContributionYears,
      availableContributionYears: contributionYears.map((item) => item.year),
      warnings,
      rateLimit: {
        remaining,
        resetAt,
        limited: remaining === 0,
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
