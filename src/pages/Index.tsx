import { useState } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import GitHubProfile from '@/components/GitHubProfile'
import RepositoryList from '@/components/RepositoryList'
import ContributionActivity from '@/components/ContributionActivity'
import TimeTracker from '@/components/TimeTracker'
import { GitHubUser, GitHubRepository, GitHubEvent } from '@/types/github'
import { Search } from 'lucide-react'

export default function Index() {
  const [username, setUsername] = useState('')
  const [user, setUser] = useState<GitHubUser | null>(null)
  const [repos, setRepos] = useState<GitHubRepository[]>([])
  const [events, setEvents] = useState<GitHubEvent[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const getErrorMessage = async (response: Response, fallback: string) => {
    try {
      const data: unknown = await response.json()
      if (
        typeof data === 'object' &&
        data !== null &&
        'message' in data &&
        typeof data.message === 'string'
      ) {
        return data.message
      }
    } catch {
      // Ignore JSON parse errors and return fallback message.
    }
    return fallback
  }

  const fetchGitHubData = async () => {
    const normalizedUsername = username.trim()
    if (!normalizedUsername) return

    setLoading(true)
    setError(null)

    try {
      const [userRes, reposRes, eventsRes] = await Promise.all([
        fetch(`https://api.github.com/users/${encodeURIComponent(normalizedUsername)}`),
        fetch(`https://api.github.com/users/${encodeURIComponent(normalizedUsername)}/repos?sort=updated&per_page=10`),
        fetch(`https://api.github.com/users/${encodeURIComponent(normalizedUsername)}/events?per_page=20`),
      ])

      if (!userRes.ok) {
        throw new Error(await getErrorMessage(userRes, 'User not found'))
      }

      const userData: GitHubUser = await userRes.json()
      const reposData: unknown = reposRes.ok ? await reposRes.json() : []
      const eventsData: unknown = eventsRes.ok ? await eventsRes.json() : []

      setUser(userData)
      setRepos(Array.isArray(reposData) ? reposData : [])
      setEvents(Array.isArray(eventsData) ? eventsData : [])

      if (!reposRes.ok || !eventsRes.ok) {
        setError('Loaded profile, but some activity data is currently unavailable.')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch data')
      setUser(null)
      setRepos([])
      setEvents([])
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    fetchGitHubData()
  }

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
            onChange={(e) => setUsername(e.target.value)}
          />
          <Button type="submit" disabled={loading}>
            <Search className="w-4 h-4 mr-2" />
            {loading ? 'Loading...' : 'Search'}
          </Button>
        </form>

        {error && (
          <p className="text-center text-destructive">{error}</p>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            {user && <GitHubProfile user={user} />}
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