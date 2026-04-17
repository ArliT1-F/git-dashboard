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
  updated_at: string
}

export interface GitHubEvent {
  id: string
  type: string
  repo: { name: string }
  created_at: string
  payload: {
    action?: string
    ref_type?: string
    commits?: { message: string }[]
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
  days: GitHubContributionDay[]
  monthlyTotals: GitHubContributionMonthTotal[]
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
  profileReadme: GitHubProfileReadme
  locationInsight: GitHubLocationInsight
  achievements: GitHubAchievement[]
  contributions: GitHubContributionYearSummary
  availableContributionYears: number[]
}