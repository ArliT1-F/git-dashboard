import { useMemo } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  GitHubAchievement,
  GitHubContributionDay,
  GitHubContributionYearSummary,
  GitHubLocationInsight,
  GitHubContributionMonthTotal,
  GitHubUser,
} from '@/types/github'

interface GitHubInsightsProps {
  user: GitHubUser
  profileReadmeHtml: string | null
  profileReadmeSourceUrl: string | null
  achievements: GitHubAchievement[]
  locationInsight: GitHubLocationInsight
  contributionSummary: GitHubContributionYearSummary | null
  contributionDays: GitHubContributionDay[]
  contributionMonthlyTotals: GitHubContributionMonthTotal[]
  selectedYear: number
  availableYears: number[]
  onSelectYear: (year: number) => void
}

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

const formatDate = (dateString: string) =>
  new Date(dateString).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })

const getYearRange = (createdAt: string) => {
  const startYear = new Date(createdAt).getFullYear()
  const currentYear = new Date().getFullYear()
  const years: number[] = []

  for (let year = currentYear; year >= startYear; year -= 1) {
    years.push(year)
  }

  return years
}

const toTimezoneLabel = (timezone: string | null) => {
  if (!timezone) return 'Unknown'

  const parts = timezone.split('/')
  if (parts.length === 1) return timezone
  return `${parts[0]} / ${parts.slice(1).join(' / ').replace(/_/g, ' ')}`
}

const getContributionIntensityClass = (count: number) => {
  if (count <= 0) return 'bg-muted'
  if (count <= 2) return 'bg-emerald-900/60'
  if (count <= 5) return 'bg-emerald-700/70'
  if (count <= 9) return 'bg-emerald-600/80'
  return 'bg-emerald-400'
}

export default function GitHubInsights({
  user,
  profileReadmeHtml,
  profileReadmeSourceUrl,
  achievements,
  locationInsight,
  contributionSummary,
  contributionDays,
  contributionMonthlyTotals,
  selectedYear,
  availableYears,
  onSelectYear,
}: GitHubInsightsProps) {
  const yearOptions = useMemo(() => {
    if (availableYears.length > 0) {
      return availableYears
    }
    return getYearRange(user.created_at)
  }, [availableYears, user.created_at])

  const contributionWeeks = useMemo(() => {
    const bucket = new Map<string, GitHubContributionDay[]>()

    for (const day of contributionDays) {
      const date = new Date(day.date)
      const weekStart = new Date(date)
      weekStart.setDate(date.getDate() - date.getDay())
      const weekKey = weekStart.toISOString().slice(0, 10)
      const existing = bucket.get(weekKey) || []
      existing.push(day)
      bucket.set(weekKey, existing)
    }

    return Array.from(bucket.entries())
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([, days]) => {
        const byWeekday = new Map(days.map((day) => [new Date(day.date).getDay(), day]))
        return WEEKDAY_LABELS.map((_, weekdayIndex) => byWeekday.get(weekdayIndex) || null)
      })
  }, [contributionDays])

  const timezoneNow = useMemo(() => {
    if (!locationInsight.timezone) return null
    try {
      return new Intl.DateTimeFormat('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
        timeZone: locationInsight.timezone,
      }).format(new Date())
    } catch {
      return null
    }
  }, [locationInsight.timezone])

  return (
    <div className="space-y-6">
      <Card className="w-full">
        <CardHeader>
          <CardTitle>Profile Insights</CardTitle>
          <CardDescription>
            Additional signals from account activity, milestones, and profile metadata.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div>
            <h3 className="text-sm font-semibold mb-2">Achievements</h3>
            {achievements.length === 0 ? (
              <p className="text-sm text-muted-foreground">No notable achievements inferred yet.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {achievements.map((achievement) => (
                  <Badge key={achievement.key} variant="secondary" className="text-xs px-3 py-1">
                    {achievement.label}
                  </Badge>
                ))}
              </div>
            )}
          </div>

          <div>
            <h3 className="text-sm font-semibold mb-2">Location & Timezone</h3>
            <div className="grid sm:grid-cols-3 gap-2 text-sm">
              <div className="border rounded-md p-3">
                <p className="text-muted-foreground">Location</p>
                <p className="font-medium">{locationInsight.location || 'Unknown'}</p>
              </div>
              <div className="border rounded-md p-3">
                <p className="text-muted-foreground">Timezone</p>
                <p className="font-medium">{toTimezoneLabel(locationInsight.timezone)}</p>
              </div>
              <div className="border rounded-md p-3">
                <p className="text-muted-foreground">Local time</p>
                <p className="font-medium">{timezoneNow || 'Unavailable'}</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="w-full">
        <CardHeader>
          <CardTitle>Contribution History</CardTitle>
          <CardDescription>
            Select a year since account creation to inspect annual contributions.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {yearOptions.map((year) => (
              <Button
                key={year}
                type="button"
                variant={year === selectedYear ? 'default' : 'outline'}
                size="sm"
                onClick={() => onSelectYear(year)}
              >
                {year}
              </Button>
            ))}
          </div>

          {contributionSummary && (
            <div className="grid sm:grid-cols-3 gap-3">
              <div className="border rounded-md p-3">
                <p className="text-muted-foreground text-sm">Total contributions</p>
                <p className="font-semibold text-lg">{contributionSummary.totalContributions}</p>
              </div>
              <div className="border rounded-md p-3">
                <p className="text-muted-foreground text-sm">Max in one day</p>
                <p className="font-semibold text-lg">{contributionSummary.maxContributionsOnDay}</p>
              </div>
              <div className="border rounded-md p-3">
                <p className="text-muted-foreground text-sm">Days with contributions</p>
                <p className="font-semibold text-lg">
                  {contributionDays.filter((day) => day.contributionCount > 0).length}
                </p>
              </div>
            </div>
          )}

          {contributionMonthlyTotals.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold mb-2">Monthly totals</h3>
              <div className="grid sm:grid-cols-4 lg:grid-cols-6 gap-2">
                {contributionMonthlyTotals.map((month) => (
                  <div key={month.month} className="border rounded-md p-2 text-sm">
                    <p className="text-muted-foreground">{month.month}</p>
                    <p className="font-medium">{month.total}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {contributionWeeks.length > 0 ? (
            <div className="overflow-x-auto">
              <div className="inline-flex gap-1 min-w-max border rounded-md p-3">
                {contributionWeeks.map((week, weekIndex) => (
                  <div key={weekIndex} className="grid grid-rows-7 gap-1">
                    {week.map((day, dayIndex) => (
                      <div
                        key={`${weekIndex}-${dayIndex}`}
                        className={`h-3 w-3 rounded-[2px] ${getContributionIntensityClass(day?.contributionCount || 0)}`}
                        title={
                          day
                            ? `${day.contributionCount} contributions on ${formatDate(day.date)}`
                            : `${WEEKDAY_LABELS[dayIndex]} (no data)`
                        }
                      />
                    ))}
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No contribution data available for this year.</p>
          )}
        </CardContent>
      </Card>

      <Card className="w-full">
        <CardHeader>
          <CardTitle>Profile README</CardTitle>
          <CardDescription>
            Rendered from <code>{user.login}/{user.login}</code> repository README when available.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {profileReadmeHtml ? (
            <div className="space-y-3">
              <div
                className="prose prose-invert max-w-none text-sm"
                dangerouslySetInnerHTML={{ __html: profileReadmeHtml }}
              />
              {profileReadmeSourceUrl && (
                <a
                  href={profileReadmeSourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:underline text-sm"
                >
                  View source README on GitHub
                </a>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              This user does not appear to have a profile README, or it is not publicly readable.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
