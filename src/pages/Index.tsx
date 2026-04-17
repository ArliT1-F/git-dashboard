import { useEffect, useRef, useState } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import GitHubProfile from '@/components/GitHubProfile'
import GitHubInsights from '@/components/GitHubInsights'
import RepositoryList from '@/components/RepositoryList'
import ContributionActivity from '@/components/ContributionActivity'
import TimeTracker from '@/components/TimeTracker'
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
import { Search } from 'lucide-react'

const DEBOUNCE_MS = 350

const emptyReadme: GitHubProfileReadme = {
  exists: false,
  contentHtml: null,
  sourceUrl: null,
  updatedAt: null,
}

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

  return (
    <div className="min-h-screen p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold mb-2">Git Dashboard</h1>
          <p className="text-muted-foreground">Track GitHub activity and development time</p>
        </div>

        <form onSubmit={handleSubmit} className="flex gap-2 max-w-md mx-auto">
          <Input
            placeholder="Enter GitHub username"
            value={username}
            onChange={(e) => handleInputChange(e.target.value)}
          />
          <Button type="submit" disabled={loading}>
            <Search className="w-4 h-4 mr-2" />
            {loading ? 'Loading...' : 'Search'}
          </Button>
        </form>

        {error && (
          <p className="text-center text-destructive">{error}</p>
        )}
        {rateLimitInfo && (
          <p className="text-center text-muted-foreground text-sm">{rateLimitInfo}</p>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
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
            <TimeTracker />
            {events.length > 0 && <ContributionActivity events={events} />}
          </div>
        </div>
      </div>
    </div>
  )
}