import { useMemo } from 'react'
import { GitHubContributionYearSummary, GitHubRepository, GitHubUser } from '@/types/github'
import { Card, CardContent } from '@/components/ui/card'
import { formatCompactNumber, formatNumber } from '@/lib/format'
import { summarizeContributions } from '@/lib/contributions'
import { summarizeLanguages } from '@/lib/languages'
import { CalendarDays, Code2, Flame, FolderGit2, Star, Users } from 'lucide-react'
import type { ReactElement } from 'react'

interface StatsOverviewProps {
  user: GitHubUser
  repositories: GitHubRepository[]
  contributions: GitHubContributionYearSummary[]
}

const Tile = ({
  icon,
  label,
  value,
  hint,
}: {
  icon: ReactElement
  label: string
  value: string
  hint?: string
}) => (
  <Card className="bg-card/70 backdrop-blur">
    <CardContent className="flex items-center gap-3 p-4">
      <div className="rounded-md border border-border/70 bg-background/60 p-2 text-blue-300">{icon}</div>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="truncate text-lg font-semibold" title={value}>
          {value}
        </p>
        {hint && <p className="truncate text-[11px] text-muted-foreground">{hint}</p>}
      </div>
    </CardContent>
  </Card>
)

export default function StatsOverview({ user, repositories, contributions }: StatsOverviewProps) {
  const currentYear = new Date().getUTCFullYear()

  const stars = useMemo(
    () => repositories.reduce((sum, repo) => sum + repo.stargazers_count, 0),
    [repositories]
  )

  const topLanguage = useMemo(() => summarizeLanguages(repositories)[0] ?? null, [repositories])

  const currentYearSummary = useMemo(() => {
    const direct = contributions.find((entry) => entry.year === currentYear)
    if (direct) return direct
    return contributions[0] ?? null
  }, [contributions, currentYear])

  const currentStreak = useMemo(
    () =>
      currentYearSummary?.year === currentYear
        ? summarizeContributions(currentYearSummary.days).currentStreak
        : null,
    [currentYearSummary, currentYear]
  )

  const accountYears = useMemo(() => {
    const created = new Date(user.created_at)
    if (Number.isNaN(created.getTime())) return null
    const years = (Date.now() - created.getTime()) / (1000 * 60 * 60 * 24 * 365.25)
    return years >= 1 ? Math.floor(years) : null
  }, [user.created_at])

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
      <Tile
        icon={<FolderGit2 className="h-4 w-4" />}
        label="Public repos"
        value={formatCompactNumber(user.public_repos)}
        hint={accountYears ? `${accountYears}y on GitHub` : undefined}
      />
      <Tile
        icon={<Star className="h-4 w-4" />}
        label="Stars (loaded)"
        value={formatCompactNumber(stars)}
        hint={`${formatNumber(repositories.length)} repositories`}
      />
      <Tile
        icon={<Users className="h-4 w-4" />}
        label="Followers"
        value={formatCompactNumber(user.followers)}
        hint={`${formatCompactNumber(user.following)} following`}
      />
      <Tile
        icon={<CalendarDays className="h-4 w-4" />}
        label={`Contributions ${currentYearSummary?.year ?? ''}`.trim()}
        value={
          currentYearSummary ? formatCompactNumber(currentYearSummary.totalContributions) : '—'
        }
        hint={currentYearSummary ? `${formatNumber(currentYearSummary.activeDays)} active days` : undefined}
      />
      <Tile
        icon={<Flame className="h-4 w-4" />}
        label="Current streak"
        value={currentStreak === null ? '—' : `${currentStreak} days`}
        hint={currentStreak === null ? 'Only for the current year' : undefined}
      />
      <Tile
        icon={<Code2 className="h-4 w-4" />}
        label="Top language"
        value={topLanguage?.language ?? '—'}
        hint={topLanguage ? `${topLanguage.percentage.toFixed(0)}% of loaded repos` : undefined}
      />
    </div>
  )
}
