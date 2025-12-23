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

  const fetchGitHubData = async () => {
    if (!username.trim()) return

    setLoading(true)
    setError(null)

    try {
      const [userRes, reposRes, eventsRes] = await Promise.all([
        fetch(`https://api.github.com/users/${username}`),
        fetch(`https://api.github.com/users/${username}/repos?sort=updated&per_page=10`),
        fetch(`https://api.github.com/users/${username}/events?per_page=20`),
      ])

      if (!userRes.ok) {
        throw new Error('User not found')
      }

      const userData = await userRes.json()
      const reposData = await reposRes.json()
      const eventsData = await eventsRes.json()

      setUser(userData)
      setRepos(reposData)
      setEvents(eventsData)
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