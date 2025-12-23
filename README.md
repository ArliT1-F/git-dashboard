# Git Dashboard

A developer dashboard for tracking GitHub activity and development time.

![GitHub Dark Theme](https://img.shields.io/badge/theme-GitHub%20Dark-0d1117)

## Features

- **GitHub Profile Viewer** - Search and view any GitHub user's profile
- **Repository List** - Browse recent repositories with language, stars, and forks
- **Contribution Activity** - View recent GitHub events (commits, PRs, stars, forks)
- **Time Tracker** - Track development time with start/stop timer and session logs

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
│   ├── GitHubProfile.tsx
│   ├── RepositoryList.tsx
│   └── TimeTracker.tsx
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

## Usage

1. Enter a GitHub username in the search bar
2. View the user's profile, repositories, and recent activity
3. Use the Time Tracker to log development sessions (stored in localStorage)

## License

[MIT](LICENSE)
