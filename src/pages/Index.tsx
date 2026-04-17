import { useEffect, useRef, useState } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import GitHubProfile from '@/components/GitHubProfile'
import GitHubInsights from '@/components/GitHubInsights'
import RepositoryList from '@/components/RepositoryList'
import ContributionActivity from '@/components/ContributionActivity'
import {
  GitHubDashboardPayload,
  GitHubUser,
  GitHubRepository,
  GitHubEvent,
  GitHubAchievement,
  GitHubProfileReadme,
  GitHubLocationInsight,
  GitHubContributionYearSummary,
} from '@/types/github'
import { Activity, GitBranch, Search, Sparkles } from 'lucide-react'
const DEBOUNCE_MS = 350

const emptyLocationInsight: GitHubLocationInsight = {
  location: null,
  timezone: null,
  inferredFromLocation: false,
  source: null,
}

const emptyContributionSummary: GitHubContributionYearSummary = {
  year: new Date().getFullYear(),
  totalContributions: 0,
  maxContributionsOnDay: 0,
  longestStreak: 0,
  days: [],
  monthlyTotals: [],
}

const emptyReadme: GitHubProfileReadme = {
  exists: false,
  contentHtml: null,
  sourceUrl: null,
  updatedAt: null,
}

export default function Index() {
  const [username, setUsername] = useState('')
  const [user, setUser] = useState<GitHubUser | null>(null)
  const [repos, setRepos] = useState<GitHubRepository[]>([])
  const [events, setEvents] = useState<GitHubEvent[]>([])
  const [profileReadme, setProfileReadme] = useState<GitHubProfileReadme>(emptyReadme)
  const [achievements, setAchievements] = useState<GitHubAchievement[]>([])
  const [locationInsight, setLocationInsight] = useState<GitHubLocationInsight>(emptyLocationInsight)
  const [contributionsByYear, setContributionsByYear] = useState<GitHubContributionYearSummary[]>([])
  const [selectedContributionYear, setSelectedContributionYear] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [rateLimitInfo, setRateLimitInfo] = useState<string | null>(null)
  const [requestedUsername, setRequestedUsername] = useState<string | null>(null)

  const abortControllerRef = useRef<AbortController | null>(null)
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const requestSeqRef = useRef(0)

  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current)
      }
      abortControllerRef.current?.abort()
    }
  }, [])

  const formatRateLimitMessage = (rateLimit: GitHubDashboardPayload['rateLimit']) => {
    if (!rateLimit) return null

    const { remaining, resetAt } = rateLimit
    if (remaining === null) return null

    if (remaining <= 0) {
      if (resetAt) {
        const resetDate = new Date(resetAt)
        return `GitHub API rate limit reached. Try again after ${resetDate.toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
        })}.`
      }
      return 'GitHub API rate limit reached. Try again soon.'
    }

    return `GitHub requests remaining: ${remaining}`
  }

  const fetchGitHubData = async (inputUsername: string) => {
    const normalizedUsername = inputUsername.trim()
    if (!normalizedUsername) return

    requestSeqRef.current += 1
    const requestId = requestSeqRef.current

    abortControllerRef.current?.abort()
    const controller = new AbortController()
    abortControllerRef.current = controller

    setLoading(true)
    setError(null)
    setRateLimitInfo(null)

    try {
      const response = await fetch(`/api/github?username=${encodeURIComponent(normalizedUsername)}`, {
        signal: controller.signal,
      })

      const responseData: unknown = await response.json()
      const payload = responseData as Partial<GitHubDashboardPayload> & { message?: string }

      if (!response.ok || !payload.user) {
        throw new Error(payload.message || 'Failed to fetch GitHub data')
      }

      if (requestId !== requestSeqRef.current) {
        return
      }

      const proxyData = payload as GitHubDashboardPayload

      setUser(proxyData.user)
      setRepos(Array.isArray(proxyData.repos) ? proxyData.repos : [])
      setEvents(Array.isArray(proxyData.events) ? proxyData.events : [])
      setProfileReadme(proxyData.profileReadme || emptyReadme)
      setAchievements(Array.isArray(proxyData.achievements) ? proxyData.achievements : [])
      setLocationInsight(proxyData.locationInsight || emptyLocationInsight)
      const contributionYears = Array.isArray(proxyData.contributions) ? proxyData.contributions : []
      setContributionsByYear(contributionYears)

      const currentYear = new Date().getFullYear()
      const preferredYear =
        contributionYears.find((entry) => entry.year === currentYear)?.year ||
        contributionYears[0]?.year ||
        null
      setSelectedContributionYear(preferredYear)

      const rateLimitMessage = formatRateLimitMessage(proxyData.rateLimit)
      setRateLimitInfo(rateLimitMessage)

      if (proxyData.warnings && proxyData.warnings.length > 0) {
        setError(proxyData.warnings.join(' '))
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        return
      }

      const message = err instanceof Error ? err.message : 'Failed to fetch data'
      setError(message)
      setUser(null)
      setRepos([])
      setEvents([])
      setProfileReadme(emptyReadme)
      setAchievements([])
      setLocationInsight(emptyLocationInsight)
      setContributionsByYear([])
      setSelectedContributionYear(null)
    } finally {
      if (requestId === requestSeqRef.current) {
        setLoading(false)
      }
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const normalizedUsername = username.trim()
    if (!normalizedUsername) return

    setRequestedUsername(normalizedUsername)
  }

  useEffect(() => {
    if (!requestedUsername) return

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current)
    }

    debounceTimerRef.current = setTimeout(() => {
      fetchGitHubData(requestedUsername)
    }, DEBOUNCE_MS)
  }, [requestedUsername])

  const handleInputChange = (value: string) => {
    setUsername(value)

    if (!value.trim()) {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current)
      }
      abortControllerRef.current?.abort()
      setLoading(false)
      setRequestedUsername(null)
    }
  }

  const activeContributionSummary =
    contributionsByYear.find((entry) => entry.year === selectedContributionYear) ||
    contributionsByYear[0] ||
    null

  const contributionYears = contributionsByYear.map((entry) => entry.year)
  const hasResults = Boolean(user || repos.length > 0 || events.length > 0)

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
                Search users, view repositories and activity, inspect yearly contributions, and read profile READMEs with a clean GitHub-inspired experience.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="mx-auto flex max-w-2xl flex-col gap-3 md:mx-0 md:flex-row">
              <Input
                placeholder="Enter GitHub username (e.g. torvalds)"
                value={username}
                onChange={(e) => handleInputChange(e.target.value)}
                className="h-12 bg-background/80 backdrop-blur"
              />
              <Button type="submit" disabled={loading} size="lg" className="h-12 md:px-8">
                <Search className="mr-2 h-4 w-4" />
                {loading ? 'Loading...' : 'Search Profile'}
              </Button>
            </form>

            {(error || rateLimitInfo) && (
              <div className="mt-4 space-y-1">
                {error && <p className="text-sm text-destructive">{error}</p>}
                {rateLimitInfo && <p className="text-sm text-muted-foreground">{rateLimitInfo}</p>}
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

        {!hasResults && !loading && (
          <section className="grid gap-4 md:grid-cols-3">
            <Card className="bg-card/70 backdrop-blur">
              <CardHeader>
                <CardTitle className="text-lg">Profile Intelligence</CardTitle>
                <CardDescription>Achievements, social metadata, and profile README rendering.</CardDescription>
              </CardHeader>
            </Card>
            <Card className="bg-card/70 backdrop-blur">
              <CardHeader>
                <CardTitle className="text-lg">Contribution Explorer</CardTitle>
                <CardDescription>Select any year since account creation and inspect contribution patterns.</CardDescription>
              </CardHeader>
            </Card>
            <Card className="bg-card/70 backdrop-blur">
              <CardHeader>
                <CardTitle className="text-lg">GitHub-native Signals</CardTitle>
                <CardDescription>Repository updates and recent event activity in a single streamlined view.</CardDescription>
              </CardHeader>
            </Card>
          </section>
        )}

        {hasResults && (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <div className="space-y-6 lg:col-span-2">
              {user && <GitHubProfile user={user} />}
              {user && (
                <GitHubInsights
                  user={user}
                  profileReadmeHtml={profileReadme.contentHtml}
                  profileReadmeSourceUrl={profileReadme.sourceUrl}
                  achievements={achievements}
                  locationInsight={locationInsight}
                  contributionSummary={activeContributionSummary}
                  contributionDays={activeContributionSummary?.days || []}
                  contributionMonthlyTotals={activeContributionSummary?.monthlyTotals || []}
                  selectedYear={selectedContributionYear || activeContributionSummary?.year || new Date().getFullYear()}
                  availableYears={contributionYears}
                  onSelectYear={setSelectedContributionYear}
                />
              )}
              {repos.length > 0 && <RepositoryList repositories={repos} />}
            </div>

            <div className="space-y-6">
              {events.length > 0 ? (
                <ContributionActivity events={events} />
              ) : (
                <Card className="bg-card/70 backdrop-blur">
                  <CardHeader>
                    <CardTitle className="text-lg">Recent Activity</CardTitle>
                    <CardDescription>No public events are currently available for this user.</CardDescription>
                  </CardHeader>
                  <CardContent className="text-sm text-muted-foreground">
                    Activity can be limited by GitHub privacy settings or temporary API availability.
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}