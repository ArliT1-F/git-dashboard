import { useMemo } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  GitHubAchievement,
  GitHubContributionYearSummary,
  GitHubLocationInsight,
  GitHubUser,
} from '@/types/github'
import {
  WEEKDAY_LABELS,
  buildContributionCalendar,
  intensityClass,
  summarizeContributions,
} from '@/lib/contributions'
import { formatNumber } from '@/lib/format'
import { sanitizeReadmeHtml } from '@/lib/readme'
import { Award, CalendarDays, Loader2, MapPin, Sparkles } from 'lucide-react'

interface GitHubInsightsProps {
  user: GitHubUser
  profileReadmeHtml: string | null
  profileReadmeSourceUrl: string | null
  achievements: GitHubAchievement[]
  locationInsight: GitHubLocationInsight
  contributionSummary: GitHubContributionYearSummary | null
  selectedYear: number
  availableYears: number[]
  loadedYears: number[]
  onSelectYear: (year: number) => void
  yearsLoading: boolean
}

const toTimezoneLabel = (timezone: string | null) => {
  if (!timezone) return 'Unknown'

  const parts = timezone.split('/')
  if (parts.length === 1) return timezone
  return `${parts[0]} / ${parts.slice(1).join(' / ').replace(/_/g, ' ')}`
}

const StatTile = ({ label, value, hint }: { label: string; value: string; hint?: string }) => (
  <div className="rounded-md border p-3">
    <p className="text-sm text-muted-foreground">{label}</p>
    <p className="text-lg font-semibold">{value}</p>
    {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
  </div>
)

export default function GitHubInsights({
  user,
  profileReadmeHtml,
  profileReadmeSourceUrl,
  achievements,
  locationInsight,
  contributionSummary,
  selectedYear,
  availableYears,
  loadedYears,
  onSelectYear,
  yearsLoading,
}: GitHubInsightsProps) {
  const contributionDays = useMemo(() => contributionSummary?.days ?? [], [contributionSummary])
  const loadedYearSet = useMemo(() => new Set(loadedYears), [loadedYears])

  const calendar = useMemo(
    () => buildContributionCalendar(contributionDays),
    [contributionDays]
  )

  const insights = useMemo(() => summarizeContributions(contributionDays), [contributionDays])

  const sanitizedReadme = useMemo(
    () => sanitizeReadmeHtml(profileReadmeHtml),
    [profileReadmeHtml]
  )

  const monthlyTotals = contributionSummary?.monthlyTotals ?? []
  const maxMonthlyTotal = monthlyTotals.reduce((max, entry) => Math.max(max, entry.total), 0)

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

  const currentYear = new Date().getUTCFullYear()
  const isViewingCurrentYear = selectedYear === currentYear
  const earnedAchievements = achievements.filter((achievement) => achievement.earned).length

  return (
    <div className="space-y-6">
      <Card className="w-full">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Award className="h-5 w-5 text-amber-300" />
            Profile Insights
          </CardTitle>
          <CardDescription>
            {earnedAchievements}/{achievements.length} milestones earned, plus timezone and profile metadata.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div>
            <h3 className="text-sm font-semibold mb-2">Milestones</h3>
            {achievements.length === 0 ? (
              <p className="text-sm text-muted-foreground">No notable milestones inferred yet.</p>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2">
                {achievements.map((achievement) => (
                  <div
                    key={achievement.key}
                    className={`rounded-md border p-3 transition-colors ${
                      achievement.earned ? 'border-emerald-500/40 bg-emerald-500/5' : 'opacity-70'
                    }`}
                    title={achievement.description}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium">{achievement.label}</p>
                      <Badge variant={achievement.earned ? 'secondary' : 'outline'} className="text-[11px]">
                        {achievement.earned ? 'Earned' : 'In progress'}
                      </Badge>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">{achievement.progress}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
              <MapPin className="h-4 w-4 text-blue-300" />
              Location &amp; Timezone
            </h3>
            <div className="grid sm:grid-cols-3 gap-2 text-sm">
              <div className="border rounded-md p-3">
                <p className="text-muted-foreground">Location</p>
                <p className="font-medium break-words">{locationInsight.location || 'Unknown'}</p>
              </div>
              <div className="border rounded-md p-3">
                <p className="text-muted-foreground">Timezone</p>
                <p className="font-medium">{toTimezoneLabel(locationInsight.timezone)}</p>
              </div>
              <div className="border rounded-md p-3">
                <p className="text-muted-foreground">Local time</p>
                <p className="font-medium">{timezoneNow || 'Unavailable'}</p>
                {locationInsight.inferredFromLocation && (
                  <p className="text-[11px] text-muted-foreground">Inferred from profile location</p>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="w-full">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CalendarDays className="h-5 w-5 text-emerald-300" />
            Contribution History
          </CardTitle>
          <CardDescription>
            Daily contribution calendar, streaks and monthly totals per year. Older years load on demand.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            {availableYears.map((year) => {
              const isLoaded = loadedYearSet.has(year)
              return (
                <Button
                  key={year}
                  type="button"
                  variant={year === selectedYear ? 'default' : 'outline'}
                  size="sm"
                  disabled={yearsLoading && !isLoaded}
                  onClick={() => onSelectYear(year)}
                  title={isLoaded ? undefined : 'Load this year from GitHub'}
                  className={isLoaded ? undefined : 'border-dashed text-muted-foreground'}
                >
                  {year}
                  {!isLoaded && <span className="ml-1 text-[10px]">•</span>}
                </Button>
              )
            })}
            {yearsLoading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
          </div>

          {contributionSummary && contributionDays.length > 0 ? (
            <>
              <div className="grid sm:grid-cols-3 lg:grid-cols-6 gap-3">
                <StatTile label="Total" value={formatNumber(contributionSummary.totalContributions)} />
                <StatTile label="Active days" value={formatNumber(insights.activeDays)} />
                <StatTile label="Longest streak" value={`${insights.longestStreak}d`} />
                <StatTile
                  label="Current streak"
                  value={isViewingCurrentYear ? `${insights.currentStreak}d` : '—'}
                  hint={isViewingCurrentYear ? undefined : `Selected year: ${selectedYear}`}
                />
                <StatTile label="Busiest day" value={formatNumber(contributionSummary.maxContributionsOnDay)} />
                <StatTile
                  label="Busiest weekday"
                  value={insights.busiestWeekday?.label ?? '—'}
                  hint={
                    insights.busiestWeekday
                      ? `${formatNumber(insights.busiestWeekday.total)} contributions`
                      : undefined
                  }
                />
              </div>

              <div>
                <h3 className="text-sm font-semibold mb-2">Monthly totals</h3>
                <div className="flex items-end gap-1.5 h-28" role="img" aria-label={`Monthly contributions in ${selectedYear}`}>
                  {monthlyTotals.map((month) => {
                    const height = maxMonthlyTotal > 0 ? (month.total / maxMonthlyTotal) * 100 : 0
                    return (
                      <div key={month.month} className="flex-1 flex flex-col items-center gap-1">
                        <div className="relative w-full flex-1 flex items-end">
                          <div
                            className="w-full rounded-t bg-emerald-500/70 hover:bg-emerald-400 transition-all"
                            style={{ height: `${Math.max(height, month.total > 0 ? 4 : 0)}%` }}
                            title={`${month.month}: ${formatNumber(month.total)} contributions`}
                          />
                        </div>
                        <span className="text-[10px] text-muted-foreground">{month.month}</span>
                      </div>
                    )
                  })}
                </div>
              </div>

              <div>
                <h3 className="text-sm font-semibold mb-2">Daily calendar</h3>
                <div className="overflow-x-auto pb-2">
                  <div className="inline-flex flex-col gap-1 min-w-max rounded-md border p-3">
                    <div className="flex gap-1 pl-8">
                      {calendar.weeks.map((week, index) => {
                        const label = calendar.monthLabels.find((entry) => entry.weekIndex === index)
                        return (
                          <div key={`label-${week.key}`} className="w-3 text-[10px] text-muted-foreground">
                            {label ? label.label : ''}
                          </div>
                        )
                      })}
                    </div>
                    <div className="flex gap-1">
                      <div className="grid grid-rows-7 gap-1 pr-1">
                        {WEEKDAY_LABELS.map((label, index) => (
                          <span
                            key={label}
                            className="h-3 text-[9px] leading-3 text-muted-foreground"
                            aria-hidden={index % 2 === 1}
                          >
                            {index % 2 === 1 ? label : ''}
                          </span>
                        ))}
                      </div>
                      {calendar.weeks.map((week) => (
                        <div key={week.key} className="grid grid-rows-7 gap-1">
                          {week.days.map((day, dayIndex) => (
                            <div
                              key={`${week.key}-${dayIndex}`}
                              className={`h-3 w-3 rounded-[2px] ${
                                day && !day.isFuture
                                  ? intensityClass(day.level)
                                  : 'border border-border/60 bg-transparent'
                              }`}
                              title={
                                day
                                  ? day.isFuture
                                    ? `${day.date} (upcoming)`
                                    : day.label
                                  : undefined
                              }
                            />
                          ))}
                        </div>
                      ))}
                    </div>
                    <div className="flex items-center justify-end gap-1 pt-1 text-[10px] text-muted-foreground">
                      <span>Less</span>
                      {[0, 1, 2, 3, 4].map((level) => (
                        <span key={level} className={`h-3 w-3 rounded-[2px] ${intensityClass(level)}`} />
                      ))}
                      <span>More</span>
                    </div>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              {yearsLoading
                ? 'Loading contributions for this year…'
                : `No contribution data available for ${selectedYear}.`}
            </p>
          )}
        </CardContent>
      </Card>

      <Card className="w-full">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-blue-300" />
            Profile README
          </CardTitle>
          <CardDescription>
            Rendered from <code>{user.login}/{user.login}</code> repository README when available.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {sanitizedReadme ? (
            <div className="space-y-3">
              <div
                className="prose prose-invert max-w-none text-sm [&_img]:inline-block [&_img]:max-w-full [&_table]:block [&_table]:overflow-x-auto"
                // Sanitised above: scripts, event handlers and javascript: URLs are stripped.
                dangerouslySetInnerHTML={{ __html: sanitizedReadme }}
              />
              {profileReadmeSourceUrl && (
                <a
                  href={profileReadmeSourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-400 hover:underline text-sm"
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
