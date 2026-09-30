import { useMemo, useState } from 'react'
import { GitHubRepository } from '@/types/github'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { formatCompactNumber, formatNumber, pluralize } from '@/lib/format'
import { languageDonutGradient, summarizeLanguages } from '@/lib/languages'
import { PieChart, Star } from 'lucide-react'

interface LanguageBreakdownProps {
  repositories: GitHubRepository[]
}

const MAX_VISIBLE_LANGUAGES = 6

export default function LanguageBreakdown({ repositories }: LanguageBreakdownProps) {
  const [includeForks, setIncludeForks] = useState(false)

  const stats = useMemo(
    () => summarizeLanguages(repositories, includeForks),
    [repositories, includeForks]
  )

  const totalStars = useMemo(
    () =>
      repositories
        .filter((repo) => includeForks || !repo.fork)
        .reduce((sum, repo) => sum + repo.stargazers_count, 0),
    [repositories, includeForks]
  )

  if (repositories.length === 0) return null

  const visible = stats.slice(0, MAX_VISIBLE_LANGUAGES)
  const hidden = stats.slice(MAX_VISIBLE_LANGUAGES)
  const hiddenShare = hidden.reduce((sum, stat) => sum + stat.percentage, 0)
  const donutStats =
    hidden.length > 0
      ? [
          ...visible,
          {
            language: 'Other',
            color: '#484f58',
            repos: hidden.reduce((sum, stat) => sum + stat.repos, 0),
            stars: hidden.reduce((sum, stat) => sum + stat.stars, 0),
            percentage: hiddenShare,
          },
        ]
      : visible

  const topLanguage = stats[0]

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <PieChart className="h-5 w-5 text-blue-300" />
          Language Mix
        </CardTitle>
        <CardDescription>
          {stats.length === 0
            ? 'No language metadata available for the loaded repositories.'
            : `${pluralize(stats.length, 'language')} across the loaded repositories${
                includeForks ? ' (including forks)' : ''
              }.`}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-6">
          <div
            className="relative h-36 w-36 shrink-0 rounded-full"
            style={{ background: languageDonutGradient(donutStats) }}
            role="img"
            aria-label={donutStats
              .map((stat) => `${stat.language} ${stat.percentage.toFixed(0)}%`)
              .join(', ')}
          >
            <div className="absolute inset-[22%] flex flex-col items-center justify-center rounded-full bg-card">
              <span className="text-xl font-bold">{stats.length}</span>
              <span className="text-[10px] text-muted-foreground">languages</span>
            </div>
          </div>

          <div className="min-w-[16rem] flex-1 space-y-2">
            {visible.map((stat) => (
              <div key={stat.language} className="space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2">
                    <span
                      className="h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: stat.color }}
                      aria-hidden
                    />
                    {stat.language}
                  </span>
                  <span className="text-muted-foreground">
                    {stat.percentage.toFixed(1)}% · {pluralize(stat.repos, 'repo')}
                  </span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${stat.percentage}%`, backgroundColor: stat.color }}
                  />
                </div>
              </div>
            ))}
            {hidden.length > 0 && (
              <p className="text-xs text-muted-foreground">
                + {pluralize(hidden.length, 'more language')} ({hiddenShare.toFixed(1)}%)
              </p>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 border-t pt-3 text-sm">
          {topLanguage && (
            <Badge variant="secondary" className="text-xs">
              Most used: {topLanguage.language}
            </Badge>
          )}
          <Badge variant="outline" className="gap-1 text-xs">
            <Star className="h-3 w-3" />
            {formatCompactNumber(totalStars)} stars across loaded repos
          </Badge>
          <span className="text-xs text-muted-foreground">
            {formatNumber(repositories.length)} repositories loaded
          </span>
          <button
            type="button"
            onClick={() => setIncludeForks((value) => !value)}
            className="ml-auto text-xs text-muted-foreground underline-offset-2 hover:underline"
          >
            {includeForks ? 'Exclude forks' : 'Include forks'}
          </button>
        </div>
      </CardContent>
    </Card>
  )
}
