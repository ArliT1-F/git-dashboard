const GITHUB_API_BASE_URL = 'https://api.github.com'
const REQUEST_TIMEOUT_MS = 10_000
const CACHE_CONTROL_HEADER = 's-maxage=60, stale-while-revalidate=300'

export const config = {
  runtime: 'edge',
}

type ErrorResponse = {
  message?: string
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

export default async function handler(request: Request) {
  const requestUrl = new URL(request.url)
  const username = requestUrl.searchParams.get('username')?.trim()

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

    const user = await userResponse.json()

    const [reposResponse, eventsResponse] = await Promise.all([
      githubRequest(`/users/${encodedUsername}/repos?sort=updated&per_page=10`, timeoutController.signal),
      githubRequest(`/users/${encodedUsername}/events?per_page=20`, timeoutController.signal),
    ])

    const reposRateLimit = parseRateLimitInfo(reposResponse)
    const eventsRateLimit = parseRateLimitInfo(eventsResponse)
    const warnings: string[] = []

    const reposPayload: unknown = reposResponse.ok ? await reposResponse.json() : []
    if (!reposResponse.ok) {
      warnings.push(await buildEndpointWarning('repositories', reposResponse, reposRateLimit))
    }

    const eventsPayload: unknown = eventsResponse.ok ? await eventsResponse.json() : []
    if (!eventsResponse.ok) {
      warnings.push(await buildEndpointWarning('activity events', eventsResponse, eventsRateLimit))
    }

    const remainingCandidates = [
      userRateLimit.remaining,
      reposRateLimit.remaining,
      eventsRateLimit.remaining,
    ].filter((value): value is number => typeof value === 'number')

    const remaining = remainingCandidates.length > 0 ? Math.min(...remainingCandidates) : null
    const resetAt = userRateLimit.resetAt || reposRateLimit.resetAt || eventsRateLimit.resetAt

    if (typeof remaining === 'number' && remaining > 0 && remaining <= 3) {
      warnings.push(`GitHub API rate limit is low (${remaining} requests remaining).`)
    }

    return jsonResponse({
      user,
      repos: Array.isArray(reposPayload) ? reposPayload : [],
      events: Array.isArray(eventsPayload) ? eventsPayload : [],
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
