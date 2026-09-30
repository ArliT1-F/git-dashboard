import { useMemo, useState } from 'react'
import { GitHubRepository } from '@/types/github'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Circle,
  ExternalLink,
  GitFork,
  Home,
  Loader2,
  Scale,
  Search,
  Star,
  TriangleAlert,
} from 'lucide-react'
import { formatCompactNumber, formatNumber } from '@/lib/format'
import { formatRelativeTime, formatShortDate } from '@/lib/dates'
import { getLanguageColor } from '@/lib/languages'

interface RepositoryListProps {
  repositories: GitHubRepository[]
  hasMore?: boolean
  onLoadMore?: () => void
  loadingMore?: boolean
  totalFetched?: number
  canLoadMore?: boolean
  loading?: boolean
}

type SortKey = 'updated' | 'stars' | 'forks' | 'name' | 'created'

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'updated', label: 'Recently updated' },
  { key: 'stars', label: 'Most stars' },
  { key: 'forks', label: 'Most forks' },
  { key: 'created', label: 'Newest' },
  { key: 'name', label: 'Name (A–Z)' },
]

const SORT_LABELS: Record<SortKey, string> = {
  updated: 'Recency',
  stars: 'Stars',
  forks: 'Forks',
  created: 'Newest',
  name: 'Name',
}

export default function RepositoryList({
  repositories,
  hasMore = false,
  onLoadMore,
  loadingMore = false,
  totalFetched,
  canLoadMore = hasMore,
  loading = false,
}: RepositoryListProps) {
  const [sortKey, setSortKey] = useState<SortKey>('updated')
  const [languageFilter, setLanguageFilter] = useState<string>('all')
  const [query, setQuery] = useState('')
  const [showForks, setShowForks] = useState(true)

  const languages = useMemo(() => {
    const counts = new Map<string, number>()
    for (const repo of repositories) {
      if (!repo.language) continue
      counts.set(repo.language, (counts.get(repo.language) ?? 0) + 1)
    }
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
  }, [repositories])

  const visibleRepositories = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()

    const filtered = repositories.filter((repo) => {
      if (!showForks && repo.fork) return false
      if (languageFilter !== 'all' && repo.language !== languageFilter) return false
      if (!normalizedQuery) return true

      return (
        repo.name.toLowerCase().includes(normalizedQuery) ||
        (repo.description ?? '').toLowerCase().includes(normalizedQuery) ||
        repo.topics.some((topic) => topic.toLowerCase().includes(normalizedQuery))
      )
    })

    const time = (value: string | null) => (value ? new Date(value).getTime() : 0)

    return [...filtered].sort((a, b) => {
      switch (sortKey) {
        case 'stars':
          return b.stargazers_count - a.stargazers_count || a.name.localeCompare(b.name)
        case 'forks':
          return b.forks_count - a.forks_count || a.name.localeCompare(b.name)
        case 'created':
          return time(b.created_at) - time(a.created_at)
        case 'name':
          return a.name.localeCompare(b.name)
        case 'updated':
        default:
          return time(b.pushed_at ?? b.updated_at) - time(a.pushed_at ?? a.updated_at)
      }
    })
  }, [repositories, query, languageFilter, sortKey, showForks])

  const displayedCount = totalFetched ?? repositories.length
  const forkCount = repositories.filter((repo) => repo.fork).length
  const isFiltered =
    query.trim().length > 0 || languageFilter !== 'all' || !showForks

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center justify-between gap-2">
          <span>Recent Repositories</span>
          <Badge variant="outline" className="text-xs font-normal">
            {isFiltered
              ? `${visibleRepositories.length} of ${displayedCount} matching`
              : `${displayedCount}${hasMore ? '+' : ''} shown`}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Filter by name, description or topic"
              aria-label="Filter repositories"
              className="pl-9"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="sr-only" htmlFor="repository-language-filter">
              Filter by language
            </label>
            <select
              id="repository-language-filter"
              value={languageFilter}
              onChange={(event) => setLanguageFilter(event.target.value)}
              className="h-10 rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="all">All languages</option>
              {languages.map(([language, count]) => (
                <option key={language} value={language}>
                  {language} ({count})
                </option>
              ))}
            </select>
            <label className="sr-only" htmlFor="repository-sort">
              Sort repositories
            </label>
            <select
              id="repository-sort"
              value={sortKey}
              onChange={(event) => setSortKey(event.target.value as SortKey)}
              className="h-10 rounded-md border border-input bg-background px-3 text-sm"
            >
              {SORT_OPTIONS.map((option) => (
                <option key={option.key} value={option.key}>
                  {option.label}
                </option>
              ))}
            </select>
            {forkCount > 0 && (
              <Button
                type="button"
                variant={showForks ? 'outline' : 'secondary'}
                size="sm"
                className="h-10"
                onClick={() => setShowForks((value) => !value)}
                title={showForks ? `Hide ${forkCount} forked repositories` : `Show ${forkCount} forks`}
              >
                {showForks ? 'Hide forks' : `Show forks (${forkCount})`}
              </Button>
            )}
          </div>
        </div>

        <div className="space-y-4">
          {loading ? (
            <div className="space-y-3" aria-hidden>
              {[0, 1, 2].map((index) => (
                <div key={index} className="h-24 animate-pulse rounded-lg border bg-muted/40" />
              ))}
            </div>
          ) : visibleRepositories.length === 0 ? (
            <p className="py-8 text-center text-muted-foreground">
              {repositories.length === 0 ? 'No repositories found' : 'No repositories match these filters'}
            </p>
          ) : (
            visibleRepositories.map((repo) => (
              <div key={repo.id} className="border rounded-lg p-4 hover:bg-accent/50 transition-colors">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <a
                        href={repo.html_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 text-lg font-semibold text-blue-400 hover:underline"
                      >
                        {repo.name}
                        <ExternalLink className="w-4 h-4" />
                      </a>
                      {repo.fork && (
                        <Badge variant="outline" className="text-xs">
                          Fork
                        </Badge>
                      )}
                      {repo.archived && (
                        <Badge variant="outline" className="border-amber-500/40 text-xs text-amber-300">
                          Archived
                        </Badge>
                      )}
                      {repo.is_template && (
                        <Badge variant="outline" className="text-xs">
                          Template
                        </Badge>
                      )}
                      {!repo.fork && !repo.archived && !repo.is_template && (
                        <Badge variant="outline" className="text-xs">
                          Public
                        </Badge>
                      )}
                    </div>

                    {repo.description && (
                      <p className="mb-3 text-sm text-muted-foreground line-clamp-2">{repo.description}</p>
                    )}

                    <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
                      {repo.language && (
                        <div className="flex items-center gap-1">
                          <Circle
                            className="w-3 h-3"
                            fill={getLanguageColor(repo.language)}
                            color={getLanguageColor(repo.language)}
                          />
                          <span>{repo.language}</span>
                        </div>
                      )}

                      <div className="flex items-center gap-1" title={`${formatNumber(repo.stargazers_count)} stars`}>
                        <Star className="w-4 h-4" />
                        <span>{formatCompactNumber(repo.stargazers_count)}</span>
                      </div>

                      <div className="flex items-center gap-1" title={`${formatNumber(repo.forks_count)} forks`}>
                        <GitFork className="w-4 h-4" />
                        <span>{formatCompactNumber(repo.forks_count)}</span>
                      </div>

                      {repo.open_issues_count > 0 && (
                        <div
                          className="flex items-center gap-1"
                          title={`${formatNumber(repo.open_issues_count)} open issues and pull requests`}
                        >
                          <TriangleAlert className="w-4 h-4" />
                          <span>{formatCompactNumber(repo.open_issues_count)}</span>
                        </div>
                      )}

                      {repo.license && (repo.license.spdx_id || repo.license.name) && (
                        <div className="flex items-center gap-1" title="License">
                          <Scale className="w-4 h-4" />
                          <span>{repo.license.spdx_id || repo.license.name}</span>
                        </div>
                      )}

                      {repo.homepage && (
                        <a
                          href={repo.homepage}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 hover:underline"
                        >
                          <Home className="w-4 h-4" />
                          <span className="max-w-[14rem] truncate">{repo.homepage.replace(/^https?:\/\//, '')}</span>
                        </a>
                      )}

                      <span title={formatShortDate(repo.pushed_at ?? repo.updated_at)}>
                        Updated {formatRelativeTime(repo.pushed_at ?? repo.updated_at)}
                      </span>
                    </div>

                    {repo.topics.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {repo.topics.map((topic) => (
                          <button
                            key={topic}
                            type="button"
                            onClick={() => setQuery(topic)}
                            className="rounded-full border border-blue-500/30 bg-blue-500/10 px-2 py-0.5 text-[11px] text-blue-200 hover:bg-blue-500/20"
                          >
                            {topic}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {(onLoadMore && hasMore) && (
          <div className="mt-4 flex flex-col items-center gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={onLoadMore}
              disabled={loadingMore || !canLoadMore}
            >
              {loadingMore ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Fetching more repositories…
                </>
              ) : canLoadMore ? (
                'Load more repositories'
              ) : (
                'Maximum repositories fetched'
              )}
            </Button>
            {isFiltered && canLoadMore && (
              <p className="text-xs text-muted-foreground">
                Filters apply to the {displayedCount} repositories loaded so far (sorted by {SORT_LABELS[sortKey]}
                ).
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
