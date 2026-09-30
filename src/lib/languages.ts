import type { GitHubRepository } from '@/types/github'

/** Official-ish GitHub language colours (github/linguist). */
export const LANGUAGE_COLORS: Record<string, string> = {
  JavaScript: '#f1e05a',
  TypeScript: '#3178c6',
  Python: '#3572A5',
  Java: '#b07219',
  Go: '#00ADD8',
  Rust: '#dea584',
  Ruby: '#701516',
  PHP: '#4F5D95',
  C: '#555555',
  'C++': '#f34b7d',
  'C#': '#178600',
  Swift: '#F05138',
  Kotlin: '#A97BFF',
  HTML: '#e34c26',
  CSS: '#563d7c',
  SCSS: '#c6538c',
  Shell: '#89e051',
  PowerShell: '#012456',
  Dockerfile: '#384d54',
  Vue: '#41b883',
  Svelte: '#ff3e00',
  Dart: '#00B4AB',
  Elixir: '#6e4a7e',
  Haskell: '#5e5086',
  Lua: '#000080',
  Perl: '#0298c3',
  R: '#198CE7',
  Scala: '#c22d40',
  Zig: '#ec915c',
  Clojure: '#db5855',
  Julia: '#a270ba',
  MatLab: '#e16737',
  TeX: '#3D6117',
  Makefile: '#427819',
  Jupyter: '#DA5B0B',
  'Jupyter Notebook': '#DA5B0B',
  Objective_C: '#438eff',
  'Objective-C': '#438eff',
  Vim: '#199f4b',
  MDX: '#fcb32c',
  Astro: '#ff5a03',
  Nix: '#7e7eff',
}

export const UNKNOWN_LANGUAGE_COLOR = '#8b949e'

export const getLanguageColor = (language: string | null | undefined) =>
  (language && LANGUAGE_COLORS[language]) || UNKNOWN_LANGUAGE_COLOR

export type LanguageStat = {
  language: string
  color: string
  repos: number
  stars: number
  percentage: number
}

type RepoLike = Pick<GitHubRepository, 'language' | 'stargazers_count'> & { fork?: boolean }

/**
 * Distribution of languages across the loaded repositories (forks excluded by
 * default, since they usually only mirror someone else's work).
 */
export const summarizeLanguages = (repos: RepoLike[], includeForks = false): LanguageStat[] => {
  const relevant = includeForks ? repos : repos.filter((repo) => !repo.fork)
  const totals = new Map<string, { repos: number; stars: number }>()

  for (const repo of relevant) {
    if (!repo.language) continue
    const entry = totals.get(repo.language) ?? { repos: 0, stars: 0 }
    entry.repos += 1
    entry.stars += repo.stargazers_count ?? 0
    totals.set(repo.language, entry)
  }

  const totalRepos = Array.from(totals.values()).reduce((sum, entry) => sum + entry.repos, 0)

  return Array.from(totals.entries())
    .map(([language, entry]) => ({
      language,
      color: getLanguageColor(language),
      repos: entry.repos,
      stars: entry.stars,
      percentage: totalRepos > 0 ? (entry.repos / totalRepos) * 100 : 0,
    }))
    .sort((a, b) => b.repos - a.repos || a.language.localeCompare(b.language))
}

/** CSS `conic-gradient` string for a language donut chart. */
export const languageDonutGradient = (stats: LanguageStat[]) => {
  if (stats.length === 0) return 'conic-gradient(#21262d 0 100%)'

  let cursor = 0
  const stops = stats.map((stat) => {
    const start = cursor
    cursor += stat.percentage
    return `${stat.color} ${start.toFixed(2)}% ${cursor.toFixed(2)}%`
  })

  return `conic-gradient(${stops.join(', ')})`
}
