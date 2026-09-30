export interface GitHubUser {
  login: string
  id: number
  avatar_url: string
  name: string | null
  bio: string | null
  location: string | null
  company: string | null
  blog: string | null
  twitter_username?: string | null
  hireable?: boolean | null
  type?: string
  public_repos: number
  public_gists: number
  followers: number
  following: number
  created_at: string
  updated_at?: string
  /** Inferred server-side from the free-text `location` field. */
  timezone?: string | null
}

export interface GitHubRepository {
  id: number
  name: string
  full_name: string
  html_url: string
  description: string | null
  language: string | null
  stargazers_count: number
  forks_count: number
  watchers_count: number
  open_issues_count: number
  created_at: string | null
  updated_at: string | null
  pushed_at: string | null
  fork: boolean
  archived: boolean
  is_template: boolean
  default_branch: string | null
  homepage: string | null
  topics: string[]
  license: { spdx_id: string | null; name: string | null } | null
}

export interface GitHubEvent {
  id: string
  type: string
  repo: { name: string }
  created_at: string
  payload: {
    action?: string
    ref?: string
    ref_type?: string
    size?: number
    distinct_size?: number
    commits?: { sha: string; message: string }[]
    pull_request?: { number: number; title: string; merged: boolean; html_url: string }
    issue?: { number: number; title: string; html_url: string }
    forkee?: { full_name: string; html_url: string }
    release?: { tag_name: string; name: string | null; html_url: string }
  }
}

export interface TimeEntry {
  id: string
  description: string
  startTime: number
  endTime: number
  duration: number
}

export interface GitHubProfileReadme {
  exists: boolean
  contentHtml: string | null
  sourceUrl: string | null
  updatedAt: string | null
}

export interface GitHubLocationInsight {
  location: string | null
  timezone: string | null
  inferredFromLocation: boolean
  source: string | null
}

export interface GitHubAchievement {
  key: string
  label: string
  description: string
  earned: boolean
  progress: string
}

export interface GitHubContributionDay {
  date: string
  contributionCount: number
  level: number
}

export interface GitHubContributionMonthTotal {
  month: string
  total: number
}

export interface GitHubContributionYearSummary {
  year: number
  totalContributions: number
  maxContributionsOnDay: number
  longestStreak: number
  activeDays: number
  days: GitHubContributionDay[]
  monthlyTotals: GitHubContributionMonthTotal[]
}

export interface GitHubPaginationInfo {
  limit: number
  fetched: number
  hasMore: boolean
  maxLimit: number
}

export interface GitHubDashboardPayload {
  user: GitHubUser
  repos: GitHubRepository[]
  events: GitHubEvent[]
  warnings?: string[]
  rateLimit?: {
    remaining: number | null
    resetAt: string | null
    limited: boolean
  }
  pagination?: {
    repos: GitHubPaginationInfo
    events: GitHubPaginationInfo
    years: GitHubPaginationInfo
  }
  profileReadme: GitHubProfileReadme
  locationInsight: GitHubLocationInsight
  achievements: GitHubAchievement[]
  contributions: GitHubContributionYearSummary[]
  /** Years whose daily calendar is included in this payload. */
  loadedContributionYears: number[]
  /** Every year GitHub reports activity for, newest first. */
  availableContributionYears: number[]
}

export interface GitHubErrorPayload {
  message?: string
  errorCode?: string
  rateLimit?: GitHubDashboardPayload['rateLimit']
}
