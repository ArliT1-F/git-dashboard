# Git Dashboard

A GitHub intelligence dashboard with a landing-page experience for exploring user profiles, repositories, language mix and contribution patterns.

![GitHub Dark Theme](https://img.shields.io/badge/theme-GitHub%20Dark-0d1117)

## Features

- **GitHub Profile Viewer** — search any GitHub user, with followers, gists, hireable state, copy-link and deep links
- **Repository Explorer** — filter by name/description/topic, filter by language, sort by recency/stars/forks/newest/name, hide-forks toggle, fork/archived/template badges, topics, license and issue counts
- **Contribution History** — real per-year calendars (loaded on demand), current & longest streaks, active days, busiest weekday and monthly totals
- **Language Mix** — donut + bars showing language share across the loaded repositories
- **Activity Feed** — recent public events with commit messages, branch names and PR/issue links
- **Profile Insights** — milestones, inferred timezone, and rendered profile READMEs (sanitised)
- **Shareable state** — the searched login lives in the URL (`?user=torvalds`), and recent searches are remembered locally
- **Landing Experience** — minimal GitHub-themed motion, splash background art, and a polished search-first hero section

## Tech Stack

- [React 19](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/)
- [Vite](https://vitejs.dev/) — build tool and (now) local API host
- [Tailwind CSS](https://tailwindcss.com/) — styling
- [shadcn/ui](https://ui.shadcn.com/) + [Radix UI](https://www.radix-ui.com/) — components & primitives
- [Lucide React](https://lucide.dev/) — icons

## Project Structure

```
api/
└── github.ts                  # Vercel edge function: GitHub proxy + insights
src/
├── components/
│   ├── ui/                    # shadcn/ui components
│   ├── ContributionActivity.tsx
│   ├── GitHubInsights.tsx
│   ├── GitHubProfile.tsx
│   ├── LanguageBreakdown.tsx
│   ├── RepositoryList.tsx
│   └── StatsOverview.tsx
├── lib/
│   ├── contributions.ts        # UTC contribution calendar + streak maths
│   ├── dates.ts                # timezone-safe date helpers
│   ├── format.ts               # number/URL formatting
│   ├── languages.ts            # language colours + distribution
│   ├── readme.ts               # README HTML sanitiser
│   └── utils.ts                # `cn()` class merge helper
├── pages/
│   ├── Index.tsx              # Main dashboard page
│   └── NotFound.tsx           # 404 page
├── types/
│   └── github.ts              # TypeScript types
├── App.tsx                    # Root component
├── main.tsx                   # Entry point
└── index.css                  # Global styles
tests/                         # node:test suites (run with `npm test`)
scripts/render-smoke.mjs       # SSR smoke test (`npm run smoke:render`)
```

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v18+, v22 recommended for the test runner)
- npm (or [pnpm](https://pnpm.io/) — the lockfile is pnpm-based)

### Installation

```bash
npm install
# or: pnpm install
```

### Development

```bash
npm run dev
```

`vite dev` also serves `api/github.ts`, so `/api/github?username=…` works
locally without `vercel dev`. Create a `.env` file if you want a token:

```bash
GITHUB_TOKEN=ghp_…
```

### Scripts

| Script | What it does |
| --- | --- |
| `npm run dev` | Vite dev server + local API proxy |
| `npm run build` | Production build into `dist/` |
| `npm run preview` | Serves the built `dist/` (UI only — no API) |
| `npm test` | Unit tests for the proxy helpers and client libs |
| `npm run smoke:render` | Renders every component with a live API payload through SSR |
| `npm run lint` | ESLint over `src/` |

> `pnpm preview` and any static hosting serve the UI without the API function —
> `/api/github` only exists under `vite dev`, `vercel dev` or Vercel.

## Deploying on Vercel

The project includes a `vercel.json` tuned for Vite + SPA routing and an API proxy
at `api/github.ts` so GitHub tokens never reach the browser.

### Environment Variables

- `GITHUB_TOKEN` (optional but strongly recommended): used by the serverless
  proxy to raise rate limits (60 → 5 000 req/h) and to enable contribution
  history, which is only available through GitHub's GraphQL API.

### API Proxy

- Frontend requests go to `/api/github?username=<name>`.
- The function fetches profile, repositories, public events, profile README and
  contribution insights from GitHub, and returns them in a single payload.
- Responses include short edge cache hints (`s-maxage=120` +
  `stale-while-revalidate=600`), rate-limit metadata (`remaining`, `resetAt`,
  `limited`), non-fatal `warnings`, and pagination metadata per collection
  (`pagination.repos`, `pagination.events`, `pagination.years`).

| Query param | Default | Max | Description |
| --- | --- | --- | --- |
| `reposLimit` | 30 | 500 | Total repositories to fetch (multi-page, merged). |
| `eventsLimit` | 30 | 300 | Total public events to fetch (100 per page, so ≤3 requests). |
| `yearsLimit` | 5 | 12 | Most recent contribution years to fetch calendars for. |
| `year` | — | — | Optional: filter `contributions` down to one year. |

The GitHub REST API caps responses at 100 items per page; the proxy follows the
`page` cursor server-side, so a single call can return up to 500 repositories.
`pagination.*.hasMore` reports whether GitHub still holds items that were not
fetched, which drives the **Load more repositories / activity / years** controls.

Contribution history is fetched with a single GraphQL request that aliases one
`contributionsCollection(from:, to:)` per year, so each year's calendar is real
(not the trailing-12-month window). GitHub's resource limits reject more than
~12 calendars in one query, which is why `yearsLimit` caps at 12.

Without `GITHUB_TOKEN` the proxy still returns profile, repositories, events and
the README, plus a warning explaining that contribution history needs a token.

## Usage

1. Enter a GitHub username in the search bar (or press `/` to focus it).
2. Explore the profile, stats row, insights, language mix, repositories and activity.
3. Click older years to load their calendars on demand; load more repositories or
   events as needed.

## Testing

```bash
npm test              # 23 unit tests (node:test + --experimental-strip-types)
npm run smoke:render  # SSR render of every component with live/synthetic data
```

## License

[MIT](LICENSE)

See [REVIEW.md](REVIEW.md) for the bug list, the fixes applied in this pass and a
prioritised feature roadmap.
