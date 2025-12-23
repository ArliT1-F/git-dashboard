export interface GitHubUser {
  login: string
  id: number
  avatar_url: string
  name: string | null
  bio: string | null
  location: string | null
  company: string | null
  blog: string | null
  public_repos: number
  public_gists: number
  followers: number
  following: number
  created_at: string
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