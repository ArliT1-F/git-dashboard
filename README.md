# Git Dashboard

A GitHub intelligence dashboard with a landing-page experience for exploring user profiles, repositories, and contribution patterns.

![GitHub Dark Theme](https://img.shields.io/badge/theme-GitHub%20Dark-0d1117)

## Features

- **GitHub Profile Viewer** - Search and view any GitHub user's profile
- **Repository List** - Browse recent repositories with language, stars, and forks
- **Contribution Activity** - View recent GitHub events (commits, PRs, stars, forks)
- **Deep Profile Insights** - Display achievements, profile README, inferred timezone, and yearly contribution breakdowns
- **Landing Experience** - Minimal GitHub-themed motion, splash background art, and a polished search-first hero section

## Tech Stack

- [React 19](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/)
- [Vite](https://vitejs.dev/) - Build tool
- [Tailwind CSS](https://tailwindcss.com/) - Styling
- [shadcn/ui](https://ui.shadcn.com/) - UI components
- [Radix UI](https://www.radix-ui.com/) - Headless primitives
- [Lucide React](https://lucide.dev/) - Icons
- [TanStack Query](https://tanstack.com/query) - Data fetching

## Project Structure

```
src/
├── components/
│   ├── ui/                    # shadcn/ui components
│   ├── ContributionActivity.tsx
│   ├── GitHubInsights.tsx
│   ├── GitHubProfile.tsx
│   └── RepositoryList.tsx
├── lib/
│   └── utils.ts               # Utility functions
├── pages/
│   ├── Index.tsx              # Main dashboard page
│   └── NotFound.tsx           # 404 page
├── types/
│   └── github.ts              # TypeScript types
├── App.tsx                    # Root component
├── main.tsx                   # Entry point
└── index.css                  # Global styles
```

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v18+)
- [pnpm](https://pnpm.io/)

### Installation

```bash
pnpm install
```

### Development

```bash
pnpm run dev
```

### Build

```bash
pnpm run build
```

### Preview Production Build

```bash
pnpm run preview
```

## Deploying on Vercel

The project includes a `vercel.json` tuned for Vite + SPA routing and an API proxy
at `api/github.ts` to avoid exposing GitHub tokens in the browser.

### Environment Variables

Set the following environment variable in Vercel:

- `GITHUB_TOKEN` (optional but strongly recommended): a GitHub token used by the
  serverless proxy to increase API rate limits and improve reliability.

### API Proxy

- Frontend requests are sent to `/api/github?username=<name>`.
- The serverless function fetches profile, repositories, events, profile README, achievements,
  and contribution insights from GitHub.
- Responses include:
  - short edge cache hints (`s-maxage` + `stale-while-revalidate`)
  - rate-limit metadata (`remaining`, `resetAt`, `limited`)

## Usage

1. Enter a GitHub username in the search bar
2. View the user's profile, repositories, and recent activity
3. Explore profile insights, yearly contributions, and rendered profile README content

## License

[MIT](LICENSE)
