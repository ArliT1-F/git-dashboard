import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import GitHubProfile from '@/components/GitHubProfile'
import GitHubInsights from '@/components/GitHubInsights'
import RepositoryList from '@/components/RepositoryList'
import ContributionActivity from '@/components/ContributionActivity'
import LanguageBreakdown from '@/components/LanguageBreakdown'
import StatsOverview from '@/components/StatsOverview'
import { GitHubDashboardPayload, GitHubErrorPayload, GitHubLocationInsight } from '@/types/github'
import {
  Activity,
  AlertTriangle,
  GitBranch,
  History,
  RefreshCw,
  Search,
  Sparkles,
  X,
} from 'lucide-react'

const DEFAULT_REPOS_LIMIT = 30
const REPOS_LOAD_MORE_STEP = 50
const MAX_REPOS_LIMIT = 500
const DEFAULT_EVENTS_LIMIT = 30
const EVENTS_LOAD_MORE_STEP = 30
const DEFAULT_YEARS_LIMIT = 5
const YEARS_LOAD_MORE_STEP = 5
const MAX_YEARS_LIMIT = 12
const RECENT_SEARCHES_KEY = 'git-dashboard:recent-searches'
const MAX_RECENT_SEARCHES = 6

type RequestStatus = 'idle' | 'loading' | 'refreshing'

/** Per-user pagination knobs: switching users always starts from the defaults. */
type LimitState = {
  user: string
  repos: number
  events: number
  years: number
}

const defaultLimits = (): Omit<LimitState, 'user'> => ({
  repos: DEFAULT_REPOS_LIMIT,
  events: DEFAULT_EVENTS_LIMIT,
  years: DEFAULT_YEARS_LIMIT,
})

const emptyLocationInsight: GitHubLocationInsight = {
  location: null,
  timezone: null,
  inferredFromLocation: false,
  source: null,
}

const readRecentSearches = (): string[] => {
  try {
    const raw = localStorage.getItem(RECENT_SEARCHES_KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed)
      ? parsed.filter((value): value is string => typeof value === 'string').slice(0, MAX_RECENT_SEARCHES)
      : []
  } catch {
    return []
  }
}

const writeRecentSearches = (searches: string[]) => {
  try {
    localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(searches))
  } catch {
    // Storage can be unavailable (private mode); the chips are a nicety.
  }
}

export default function Index() {
  const [searchParams, setSearchParams] = useSearchParams()
  const requestedUsername = (searchParams.get('user') ?? '').trim()

  const [inputValue, setInputValue] = useState(requestedUsername)
  const [payload, setPayload] = useState<GitHubDashboardPayload | null>(null)
  const [status, setStatus] = useState<RequestStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const [warnings, setWarnings] = useState<string[]>([])
  const [reloadToken, setReloadToken] = useState(0)
  const [recentSearches, setRecentSearches] = useState<string[]>([])

  // Limits and the selected year belong to a user; deriving them from the login
  // means a switch back to the default state needs no extra render (and no
  // duplicate request with the previous user's limits).
  const [limitState, setLimitState] = useState<LimitState>({ user: '', ...defaultLimits() })
  const [yearState, setYearState] = useState<{ user: string; year: number | null }>({
    user: '',
    year: null,
  })

  const activeLimits: LimitState = useMemo(
    () =>
      limitState.user === requestedUsername
        ? limitState
        : { user: requestedUsername, ...defaultLimits() },
    [limitState, requestedUsername]
  )
  const { repos: reposLimit, events: eventsLimit, years: yearsLimit } = activeLimits
  const selectedYear = yearState.user === requestedUsername ? yearState.year : null

  const payloadRef = useRef<GitHubDashboardPayload | null>(null)
  const pendingYearRef = useRef<number | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    payloadRef.current = payload
  }, [payload])

  // Keep the input in sync with external navigation (back/forward, shared links).
  useEffect(() => {
    setInputValue(requestedUsername)
  }, [requestedUsername])

  useEffect(() => {
    setRecentSearches(readRecentSearches())
    // Keyboard shortcut: "/" focuses search from anywhere on the page.
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      const isTyping =
        target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA' || target?.isContentEditable

      if (event.key === '/' && !isTyping) {
        event.preventDefault()
        inputRef.current?.focus()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  useEffect(() => {
    if (!requestedUsername) {
      setPayload(null)
      setError(null)
      setWarnings([])
      setStatus('idle')
      return
    }

    const controller = new AbortController()
    const isSameUser =
      payloadRef.current?.user.login?.toLowerCase() === requestedUsername.toLowerCase()

    setStatus(isSameUser ? 'refreshing' : 'loading')
    setError(null)

    const load = async () => {
      try {
        const params = new URLSearchParams({
          username: requestedUsername,
          reposLimit: String(reposLimit),
          eventsLimit: String(eventsLimit),
          yearsLimit: String(yearsLimit),
        })

        const response = await fetch(`/api/github?${params.toString()}`, {
          signal: controller.signal,
        })
        const data = (await response.json().catch(() => null)) as
          | (Partial<GitHubDashboardPayload> & GitHubErrorPayload)
          | null

        if (controller.signal.aborted) return

        if (!response.ok || !data?.user) {
          throw new Error(data?.message || 'Failed to fetch GitHub data')
        }

        const nextPayload = data as GitHubDashboardPayload
        setPayload(nextPayload)
        setWarnings(Array.isArray(nextPayload.warnings) ? nextPayload.warnings : [])
        setStatus('idle')

        const loadedYears = nextPayload.loadedContributionYears ?? []
        const pendingYear = pendingYearRef.current
        pendingYearRef.current = null

        if (pendingYear !== null && !loadedYears.includes(pendingYear)) {
          setWarnings((current) => [
            ...current,
            `Contribution data for ${pendingYear} is not available (GitHub only exposes recent years).`,
          ])
        }

        const currentYear = new Date().getUTCFullYear()
        const fallbackYear = loadedYears.includes(currentYear) ? currentYear : loadedYears[0] ?? null

        setYearState((previous) => {
          if (pendingYear !== null && loadedYears.includes(pendingYear)) {
            return { user: requestedUsername, year: pendingYear }
          }
          const keepPrevious =
            previous.user === requestedUsername &&
            previous.year !== null &&
            loadedYears.includes(previous.year)
          return { user: requestedUsername, year: keepPrevious ? previous.year : fallbackYear }
        })

        setRecentSearches((current) => {
          const login = nextPayload.user.login
          const next = [login, ...current.filter((entry) => entry.toLowerCase() !== login.toLowerCase())].slice(
            0,
            MAX_RECENT_SEARCHES
          )
          writeRecentSearches(next)
          return next
        })
      } catch (err) {
        if (controller.signal.aborted || (err instanceof DOMException && err.name === 'AbortError')) {
          return
        }

        setStatus('idle')
        setError(err instanceof Error ? err.message : 'Failed to fetch GitHub data')
        if (!isSameUser) {
          setPayload(null)
        }
      }
    }

    void load()

    return () => {
      controller.abort()
    }
  }, [requestedUsername, reposLimit, eventsLimit, yearsLimit, reloadToken])

  const updateLimits = useCallback(
    (changes: Partial<Omit<LimitState, 'user'>>) => {
      setLimitState({
        user: requestedUsername,
        repos: changes.repos ?? activeLimits.repos,
        events: changes.events ?? activeLimits.events,
        years: changes.years ?? activeLimits.years,
      })
    },
    [requestedUsername, activeLimits]
  )

  const submitUsername = useCallback(
    (value: string) => {
      const normalized = value.trim()
      if (!normalized) return
      setSearchParams({ user: normalized })
    },
    [setSearchParams]
  )

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault()
    const normalized = inputValue.trim()
    if (!normalized) {
      setSearchParams({})
      return
    }
    if (normalized.toLowerCase() === requestedUsername.toLowerCase()) {
      // Re-running the same search should refresh instead of doing nothing.
      setReloadToken((token) => token + 1)
      return
    }
    submitUsername(normalized)
  }

  const handleInputChange = (value: string) => {
    setInputValue(value)
    if (!value.trim()) {
      setSearchParams({})
    }
  }

  const handleSelectYear = (year: number) => {
    const loadedYears = payload?.loadedContributionYears ?? []
    if (loadedYears.includes(year)) {
      setYearState({ user: requestedUsername, year })
      return
    }

    const index = (payload?.availableContributionYears ?? []).indexOf(year)
    if (index === -1) return

    pendingYearRef.current = year
    updateLimits({ years: Math.min(Math.max(index + 1, yearsLimit + 1), MAX_YEARS_LIMIT) })
  }

  const handleLoadMoreRepos = () => {
    const pagination = payload?.pagination?.repos
    if (!pagination?.hasMore) return
    updateLimits({
      repos: Math.min(reposLimit + REPOS_LOAD_MORE_STEP, pagination.maxLimit ?? MAX_REPOS_LIMIT),
    })
  }

  const handleLoadMoreEvents = () => {
    const pagination = payload?.pagination?.events
    if (!pagination?.hasMore) return
    updateLimits({
      events: Math.min(eventsLimit + EVENTS_LOAD_MORE_STEP, pagination.maxLimit ?? 300),
    })
  }

  const handleLoadMoreYears = () => {
    const pagination = payload?.pagination?.years
    if (!pagination?.hasMore) return
    updateLimits({ years: Math.min(yearsLimit + YEARS_LOAD_MORE_STEP, MAX_YEARS_LIMIT) })
  }

  const user = payload?.user ?? null
  const repos = useMemo(() => payload?.repos ?? [], [payload])
  const events = useMemo(() => payload?.events ?? [], [payload])
  const contributions = useMemo(() => payload?.contributions ?? [], [payload])
  const loadedYears = useMemo(() => payload?.loadedContributionYears ?? [], [payload])
  const availableYears = useMemo(() => payload?.availableContributionYears ?? [], [payload])

  const activeContributionSummary =
    contributions.find((entry) => entry.year === selectedYear) ?? contributions[0] ?? null
  const isLoading = status === 'loading'
  const isRefreshing = status === 'refreshing'
  const showSkeleton = isLoading && !user
  const hasResults = Boolean(user)

  const rateLimit = payload?.rateLimit
  const rateLimitMessage = (() => {
    if (!rateLimit || rateLimit.remaining === null) return null
    if (rateLimit.remaining <= 0) {
      const reset = rateLimit.resetAt ? new Date(rateLimit.resetAt) : null
      return reset
        ? `GitHub API rate limit reached — resets at ${reset.toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
          })}.`
        : 'GitHub API rate limit reached. Try again soon.'
    }
    return `${rateLimit.remaining} GitHub requests remaining this hour.`
  })()

  const yearsMaxLimit = payload?.pagination?.years?.maxLimit ?? MAX_YEARS_LIMIT
  const eventsMaxLimit = payload?.pagination?.events?.maxLimit ?? 300
  const eventsCanLoadMore =
    Boolean(payload?.pagination?.events?.hasMore) && eventsLimit < eventsMaxLimit
  const showMoreYears =
    contributions.length > 0 &&
    Boolean(payload?.pagination?.years?.hasMore) &&
    yearsLimit < yearsMaxLimit &&
    !isLoading

  return (
    <div className="relative min-h-screen overflow-hidden px-4 pb-10 pt-6 md:px-6">
      <div className="pointer-events-none absolute inset-0 gh-splash-art" />
      <div className="pointer-events-none absolute inset-0 gh-grid-overlay opacity-35" />

      <div className="relative mx-auto max-w-7xl space-y-8">
        <section className="relative overflow-hidden rounded-2xl border border-border/70 bg-gradient-to-br from-[#0d1117] via-[#111827] to-[#0f172a] p-6 md:p-10 shadow-2xl shadow-black/30">
          <div className="pointer-events-none absolute -right-10 -top-10 h-56 w-56 rounded-full bg-blue-500/20 blur-3xl gh-pulse-slow" />
          <div className="pointer-events-none absolute -left-12 bottom-0 h-48 w-48 rounded-full bg-emerald-500/10 blur-3xl gh-pulse-slow-delayed" />

          <div className="relative">
            <div className="mb-4 flex items-center justify-center gap-2 md:justify-start">
              <Badge variant="outline" className="border-blue-400/40 bg-blue-500/10 text-blue-200">
                <Sparkles className="mr-1.5 h-3 w-3" />
                GitHub Intelligence Landing
              </Badge>
            </div>

            <div className="mb-8 max-w-3xl">
              <h1 className="text-balance text-4xl font-bold tracking-tight md:text-6xl">
                Explore any GitHub profile with a beautiful, insight-first view
              </h1>
              <p className="mt-4 text-pretty text-base text-muted-foreground md:text-lg">
                Search users, view repositories and activity, inspect yearly contributions, and read profile
                READMEs with a clean GitHub-inspired experience.
              </p>
            </div>

            <form
              onSubmit={handleSubmit}
              className="mx-auto flex max-w-2xl flex-col gap-3 md:mx-0 md:flex-row"
            >
              <Input
                ref={inputRef}
                placeholder="Enter GitHub username (e.g. torvalds)"
                aria-label="GitHub username"
                autoComplete="off"
                spellCheck={false}
                value={inputValue}
                onChange={(event) => handleInputChange(event.target.value)}
                className="h-12 bg-background/80 backdrop-blur"
              />
              <Button type="submit" disabled={isLoading} size="lg" className="h-12 md:px-8">
                {isLoading ? (
                  <>
                    <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                    Loading…
                  </>
                ) : (
                  <>
                    <Search className="mr-2 h-4 w-4" />
                    Search Profile
                  </>
                )}
              </Button>
              {requestedUsername && (
                <Button
                  type="button"
                  variant="outline"
                  size="lg"
                  className="h-12"
                  onClick={() => setReloadToken((token) => token + 1)}
                  disabled={isLoading}
                  title="Re-fetch this profile"
                  aria-label="Refresh profile"
                >
                  <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                </Button>
              )}
            </form>

            {recentSearches.length > 0 && (
              <div className="mx-auto mt-3 flex max-w-2xl flex-wrap items-center gap-2 md:mx-0">
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <History className="h-3 w-3" />
                  Recent:
                </span>
                {recentSearches.map((login) => (
                  <button
                    key={login}
                    type="button"
                    onClick={() => submitUsername(login)}
                    className="rounded-full border border-border/70 bg-background/40 px-2.5 py-0.5 text-xs text-muted-foreground transition-colors hover:border-blue-400/50 hover:text-blue-200"
                  >
                    {login}
                  </button>
                ))}
              </div>
            )}

            {(error || warnings.length > 0 || rateLimitMessage) && (
              <div className="mt-4 space-y-2" role="status" aria-live="polite">
                {error && (
                  <div className="flex flex-wrap items-center gap-3 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                    <span>{error}</span>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7"
                      onClick={() => setReloadToken((token) => token + 1)}
                    >
                      Retry
                    </Button>
                  </div>
                )}

                {warnings.length > 0 && (
                  <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                      <ul className="flex-1 space-y-1">
                        {warnings.map((warning) => (
                          <li key={warning}>{warning}</li>
                        ))}
                      </ul>
                      <button
                        type="button"
                        aria-label="Dismiss warnings"
                        onClick={() => setWarnings([])}
                        className="text-amber-200/70 transition-colors hover:text-amber-100"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                )}

                {rateLimitMessage && <p className="text-xs text-muted-foreground">{rateLimitMessage}</p>}
              </div>
            )}

            <div className="pointer-events-none absolute right-6 top-6 hidden items-center gap-2 rounded-full border border-border/70 bg-background/40 px-3 py-1 text-xs text-muted-foreground backdrop-blur md:flex gh-float">
              <GitBranch className="h-3.5 w-3.5 text-blue-300" />
              minimal github motion
            </div>
            <div className="pointer-events-none absolute bottom-6 right-10 hidden items-center gap-2 rounded-full border border-border/70 bg-background/40 px-3 py-1 text-xs text-muted-foreground backdrop-blur lg:flex gh-float-delayed">
              <Activity className="h-3.5 w-3.5 text-emerald-300" />
              live profile insights
            </div>
          </div>
        </section>

        {showSkeleton && (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3" aria-hidden>
            <div className="space-y-6 lg:col-span-2">
              <div className="h-56 animate-pulse rounded-xl border bg-card/60" />
              <div className="h-72 animate-pulse rounded-xl border bg-card/60" />
            </div>
            <div className="space-y-6">
              <div className="h-48 animate-pulse rounded-xl border bg-card/60" />
              <div className="h-64 animate-pulse rounded-xl border bg-card/60" />
            </div>
          </div>
        )}

        {!hasResults && !isLoading && !error && (
          <section className="grid gap-4 md:grid-cols-3">
            <Card className="bg-card/70 backdrop-blur">
              <CardHeader>
                <CardTitle className="text-lg">Profile Intelligence</CardTitle>
                <CardDescription>
                  Milestones, social metadata, timezone inference and rendered profile READMEs.
                </CardDescription>
              </CardHeader>
            </Card>
            <Card className="bg-card/70 backdrop-blur">
              <CardHeader>
                <CardTitle className="text-lg">Contribution Explorer</CardTitle>
                <CardDescription>
                  Year-by-year calendars, streaks and monthly totals — loaded on demand.
                </CardDescription>
              </CardHeader>
            </Card>
            <Card className="bg-card/70 backdrop-blur">
              <CardHeader>
                <CardTitle className="text-lg">Repository Signals</CardTitle>
                <CardDescription>
                  Filter and sort repositories, inspect language mix and recent public activity.
                </CardDescription>
              </CardHeader>
            </Card>
            <p className="text-xs text-muted-foreground md:col-span-3">
              Tip: press <kbd className="rounded border px-1">/</kbd> to focus the search box. Searches are
              shareable — the username is kept in the URL.
            </p>
          </section>
        )}

        {hasResults && user && (
          <div className="space-y-6">
            <StatsOverview user={user} repositories={repos} contributions={contributions} />

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
              <div className="space-y-6 lg:col-span-2">
                <GitHubProfile user={user} />

                <GitHubInsights
                  user={user}
                  profileReadmeHtml={payload?.profileReadme?.contentHtml ?? null}
                  profileReadmeSourceUrl={payload?.profileReadme?.sourceUrl ?? null}
                  achievements={payload?.achievements ?? []}
                  locationInsight={payload?.locationInsight ?? emptyLocationInsight}
                  contributionSummary={activeContributionSummary}
                  selectedYear={activeContributionSummary?.year ?? new Date().getUTCFullYear()}
                  availableYears={availableYears}
                  loadedYears={loadedYears}
                  onSelectYear={handleSelectYear}
                  yearsLoading={isLoading}
                />

                {showMoreYears && (
                  <div className="flex justify-center">
                    <Button type="button" variant="outline" onClick={handleLoadMoreYears} disabled={isLoading}>
                      Load older contribution years
                    </Button>
                  </div>
                )}

                <LanguageBreakdown repositories={repos} />

                <RepositoryList
                  repositories={repos}
                  hasMore={Boolean(payload?.pagination?.repos?.hasMore)}
                  onLoadMore={handleLoadMoreRepos}
                  loadingMore={isLoading && reposLimit > DEFAULT_REPOS_LIMIT}
                  loading={isLoading && repos.length === 0}
                  totalFetched={payload?.pagination?.repos?.fetched ?? repos.length}
                  canLoadMore={
                    Boolean(payload?.pagination?.repos?.hasMore) &&
                    reposLimit < (payload?.pagination?.repos?.maxLimit ?? MAX_REPOS_LIMIT)
                  }
                />
              </div>

              <div className="space-y-6">
                {events.length > 0 ? (
                  <ContributionActivity
                    events={events}
                    hasMore={eventsCanLoadMore}
                    loadingMore={isLoading && eventsLimit > DEFAULT_EVENTS_LIMIT}
                    onLoadMore={handleLoadMoreEvents}
                  />
                ) : (
                  <Card className="bg-card/70 backdrop-blur">
                    <CardHeader>
                      <CardTitle className="text-lg">Recent Activity</CardTitle>
                      <CardDescription>
                        No public events are currently available for this user.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="text-sm text-muted-foreground">
                      Activity can be limited by GitHub privacy settings or temporary API availability.
                    </CardContent>
                  </Card>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
