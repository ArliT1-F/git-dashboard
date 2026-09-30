# Code Review — Bugs, Improvements & Roadmap

Review of the Git Dashboard codebase (branch `arena/01a0f2f7-git-dashboard`).
Everything in **Fixed** was implemented and verified in this branch; everything in
**Suggested** is a recommendation that has not been built yet.

Verification commands used at the end of the pass:

```bash
npm test              # 23 unit tests (proxy helpers + client libs)
npm run smoke:render  # renders every component with a live /api/github payload
npm run lint          # 0 errors
npx tsc --noEmit -p tsconfig.app.json
npm run build
```

---

## 1. Bugs found (and fixed)

### B1 — Repository pagination stopped offering "load more" too early *(fixed)*

`api/github.ts` computed `hasMore`/`truncated` only when a page overflowed the
requested limit. If a user had exactly 100 repositories and `reposLimit=100`
(GitHub's max page size), the first page filled the budget exactly, so
`hasMore` was `false` and the **Load more repositories** button disappeared even
though 50 more repositories existed.

*Fix:* `fetchPaginated()` now tracks whether the last page was full and reports
`hasMore: true` when the window is exhausted on a full page, and keeps `hasMore`
true when a mid-pagination request fails so the user can retry.
Covered by `tests/api-helpers.test.ts`.

### B2 — Contribution history for past years was always empty *(fixed)*

The GraphQL call only asked for `contributionsCollection` (no `from`/`to`), which
returns **only the trailing 12 months**. The UI still listed every year since
account creation, so selecting 2021 showed *“Total contributions 0”* — a lie for
anyone with history.

*Fix:* the proxy now issues **one** GraphQL request with one alias per year
(`year0: contributionsCollection(from: …, to: …)`), so each year's calendar is
real. Old years load on demand (`yearsLimit`, default 5, max 12 — GitHub rejects
more than ~12 calendars per query) and the UI marks unloaded years with a dashed
button that loads them on click. Verified live:
`torvalds` 2026 = 2 959 contributions / 92-day streak, 2025 = 2 925 / 354 active days.

### B3 — Contribution calendar was shifted by one day for many timezones *(fixed)*

`GitHubInsights.tsx` parsed `YYYY-MM-DD` keys with `new Date(...)` (UTC midnight)
but grouped them with `getDay()`/`setDate()` (local time). For every user west of
UTC the whole heatmap landed one column off — the classic "Sunday row shows
Saturday's data" bug.

*Fix:* new `src/lib/contributions.ts` builds the calendar entirely in UTC
(`getUTCDay`, UTC day arithmetic) and is unit tested against a Sunday-start week.

### B4 — Five of six hero animation classes never existed *(fixed)*

`Index.tsx` referenced `gh-splash-art`, `gh-grid-overlay`, `gh-pulse-slow`,
`gh-pulse-slow-delayed` and `gh-float-delayed`; `src/index.css` only ever defined
`gh-float`/`gh-float-delay`. The splash art, grid overlay, pulsing glows and one
floating badge were silent no-ops.

*Fix:* the classes are defined, the typo'd alias is kept, and all looping
animations are disabled under `prefers-reduced-motion`.

### B5 — Local development was broken (`/api/github` 404) *(fixed)*

The Vercel function at `api/github.ts` does not exist under `vite dev`, so
`pnpm dev` produced a dashboard that could never load data.

*Fix:* `vite.config.ts` ships a dev middleware that serves `api/github.ts`
through Vite's SSR pipeline, injects `GITHUB_TOKEN` **server-side only**, and
mirrors Vercel semantics. `server.host` + `allowedHosts` are configured so the
sandbox/live preview works. Verified: `GET /api/github?username=torvalds` → 200
in 1.2 s through the dev server.

### B6 — Profile README images were broken *(fixed)*

GitHub's `application/vnd.github.html` output contains **relative** URLs
(`<img src="header.gif">`). Rendered inside the dashboard those resolve against
the app's own origin and 404.

*Fix:* `rewriteReadmeUrls()` rewrites relative `src`/`href`/`srcset` to
`.../{user}/{user}/raw/HEAD/...` (images) and `/blob/HEAD/...` (links), leaving
absolute, anchor and `data:` URLs untouched. Verified against
`sindresorhus/sindresorhus`: zero relative URLs remain.

### B7 — Profile README HTML was injected unsanitised *(fixed)*

`dangerouslySetInnerHTML` with API HTML. GitHub sanitises its own output, but the
dashboard should not depend on a third party for its XSS boundary.

*Fix:* `src/lib/readme.ts` sanitises before injection (removes
`script/iframe/object/embed/form/style/…`, all `on*` handlers, `javascript:` and
`data:text/html` URLs), forces `rel="noopener noreferrer nofollow"` on links and
`loading="lazy"` on images. A regex fallback covers environments without
`DOMParser`.

### B8 — Two GitHub requests were spent on one README *(fixed)*

The proxy fetched the README twice (HTML + JSON metadata) for the `html_url`,
then discarded the second body. That is ~17 % of the per-search REST budget on
the default limits.

*Fix:* one request; the source link is derived from the login
(`https://github.com/{user}/{user}#readme`).

### B9 — Second-precision date handling produced wrong "age" strings *(fixed)*

`RepositoryList`/`ContributionActivity` used `Math.abs(now - date)` and
`Math.floor(diffDays/30)`; future timestamps rendered as "Today", and the
month/day boundaries drifted by timezone.

*Fix:* shared `src/lib/dates.ts` (`formatRelativeTime`, `formatShortDate`, …)
with explicit future handling, used by every card.

### B10 — Warnings rendered as red errors *(fixed)*

Non-fatal upstream warnings (`rate limit is low`, `repositories unavailable`)
were pushed into the same `error` state as fatal failures, so a partial success
looked like a crash.

*Fix:* separate warning banner (amber, dismissible) with `role="status"`, and a
retry action on real errors.

### B11 — Longest-streak maths counted array positions *(fixed)*

Streaks assumed consecutive array entries were consecutive days. That happened to
hold for GitHub's dense calendars but silently broke for any gap.

*Fix:* date-aware streak helpers (`calculateLongestStreak`, `calculateStreakEndingOn`,
`currentStreakEndingOn`) with tests covering gaps and "today is still empty".

### B12 — Misc. correctness & polish *(fixed)*

- `parseIntParam` accepted `"12abc"` and negative values; it now requires digits only.
- Usernames are validated before hitting GitHub (`invalid_username`, HTTP 400)
  instead of forwarding junk upstream.
- A missing user returned GitHub's bare `"Not Found"`; the descriptive fallback is
  kept instead.
- `mergeRateLimits` ignored its own comment: it now shows the soonest reset while
  rate-limited and the current window's reset otherwise.
- GitHub 403/429 discrimination (`retry-after`), network failures during
  pagination, and unexpected body shapes now produce warnings instead of throwing
  or silently truncating.
- Contribution month labels used locale formatting per day (`toLocaleDateString`
  with `month:'short'`) — they are now computed from the date key in UTC.
- Response payloads are trimmed to the fields the UI uses (repos went from ~82
  fields each to 21, events from full payloads to summaries): a 40-repo +
  3-year payload is ~75 KB and a worst-case 500-repo + 300-event + 12-year
  payload is ~600 KB, both served in ~1 s and ~6.5 s respectively.
- The events feed is now paged at 100 items per page (verified against the live
  API) instead of 30, cutting a 300-event request from 10 round trips to 3 and
  the overall proxy timeout was raised to 20 s for large "load more" requests.
- `public/favicon.svg` was a 0-byte file while `index.html` pointed at an external
  favicon; both fixed.
- `index.html` still advertised a "Time Tracker" that isn't part of the app; the
  title/description/OG tags now describe the actual product.

---

## 2. Improvements shipped

| Area | What changed |
| --- | --- |
| Shareable state | The searched user lives in the URL (`?user=torvalds`), so links are shareable and browser back/forward work. |
| Search UX | Recent searches (localStorage chips), `/` focuses the search box, refresh button re-fetches, skeleton loaders replace the empty flash. |
| Repositories | Filter by name/description/topic, filter by language, sort by recency/stars/forks/newest/name, hide-forks toggle, fork/archived/template badges, topics, license, open issues, homepage, compact star/fork counts. |
| Contributions | Real per-year calendars, month axis + weekday labels + legend, streaks (current & longest), active days, busiest weekday, monthly bar chart, on-demand loading of older years. |
| New "Language Mix" card | Donut + bars of language share across loaded repositories, with a fork toggle and aggregate stars. |
| New "at a glance" stats row | Repos, stars, followers, current-year contributions, current streak, top language. |
| Activity feed | Correct push sizes (`payload.size`, not the capped `commits` array), branch/PR number/issue links, 12 event types with distinct colours, "N events across M repositories" summary, load-more. |
| Insights card | Milestones show description + earned/in-progress state; timezone card notes that it was inferred from the location string. |
| Reliability | In-flight requests are aborted on user change, stale responses are ignored, partial failures still render, and rate-limit status is surfaced with the reset time. |
| Developer experience | `npm test` (23 tests), `npm run smoke:render` (renders every component with live data through SSR), dev API middleware, `console.error` logging for proxy failures. |

---

## 3. Suggested next steps (not built)

Priority is impact ÷ effort.

### High value

1. **GitHub OAuth sign-in.** The single biggest unlock: 5 000 req/h instead of 60,
   private repositories, and per-user caching. Requires a session cookie + token
   exchange in `api/`.
2. **Persist daily snapshots (Supabase is already a dependency but unused).**
   Store followers/stars/contribution counts per day to draw growth charts, detect
   momentum, and answer "what changed since last week?" — impossible with the
   live-only API.
3. **Route-level pages.** `react-router-dom` is installed but the app is one page.
   Add `/user/:login/repos`, `/user/:login/activity`, `/compare?users=a,b` for
   deep links and a smaller initial payload.
4. **Repository deep dive.** Per-repo commit activity, contributors, release
   cadence, issue/PR health and dependency alerts (`/repos/{owner}/{repo}/stats/*`).
5. **Comparison mode.** Two (or four) users side by side: language mix, streak,
   stars per repo, activity overlap. Very demo-friendly.
6. **Watchlist + digest.** Pin logins locally (or in Supabase when signed in),
   then show a "what happened since your last visit" feed.

### Medium

7. **Rate-limit-aware scheduler.** Queue requests client-side, respect
   `x-ratelimit-reset`, and fall back to a longer edge cache (`s-maxage`) for
   popular users. A simple LRU in the browser would also make back/forward instant.
8. **Use the unused UI dependencies or remove them.** `recharts`, `cmdk`,
   `next-themes`, `zustand`, `framer-motion`, `react-hook-form`, `zod`, `prismjs`,
   `uuid` and most `src/components/ui/*` files are never imported; they inflate
   `node_modules` and invite accidental bundle growth (bundle is already 445 KB).
   Either adopt them deliberately (command palette via `cmdk`, light/dark toggle
   via `next-themes`/the CSS variables) or prune them.
9. **Command palette.** `cmdk` is installed: `⌘K` for "search user", "open repo",
   "copy link", "toggle theme".
10. **Export & share.** PNG/OG card of the stats row (edge function + `satori`),
    Markdown/JSON export of the analysis, and a badge generator for READMEs.
11. **Timezone inference v2.** The current heuristic is a 60-entry city map. Use
    `Intl.supportedValuesOf('timeZone')` + city→timezone matching server-side, or
    fall back to the busiest commit hour.
12. **Accessibility pass.** The calendar exposes thousands of `title` tooltips;
    add a keyboard-navigable summary, `aria-live` on results, and check contrast
    of the emerald intensity scale.
13. **PWA + offline.** Cache the last profile with a service worker and show it
    offline; add `manifest.webmanifest` + install prompt.

### Smaller polish

14. Loading skeletons that match the real card shapes (currently generic blocks).
15. Sticky search bar on scroll; deep-link individual years (`?year=2025`).
16. `AbortController` on unmount for the README/avatar images (minor) and image
    `error` fallbacks when an avatar host is unreachable.
17. Surface `hireable`, `email` (when public) and organisations via
    `/users/{login}/orgs`.
18. Remove the dead `TimeTracker.tsx` (and its `TimeEntry` type) or wire it in as
    a real feature — `ProtectedRoute.tsx` is also unused and redirects to a
    non-existent `/login` route.

---

## 4. Notes for maintainers

- **Proxy contract** (see `api/github.ts`): `username` (required), `reposLimit`
  (≤500, default 30), `eventsLimit` (≤300, default 30), `yearsLimit` (≤12,
  default 5), `year` (optional filter). Responses include `warnings`,
  `rateLimit`, `pagination.{repos,events,years}`, `loadedContributionYears` and
  `availableContributionYears`.
- `GITHUB_TOKEN` is optional for profiles/repos/events/README (60 req/h
  unauthenticated) but **required** for contribution history, which is GraphQL-only.
  The proxy reports this as a warning instead of failing.
- `pnpm preview` (and any static hosting of `dist/`) serves the UI without the
  API — the function only exists under `vite dev`, `vercel dev` or Vercel.
- Node's built-in test runner executes TypeScript directly
  (`node --experimental-strip-types --test 'tests/*.test.ts'`); it resolves
  relative imports literally, so modules imported by tests must use explicit
  `.ts` extensions (allowed by `allowImportingTsExtensions`).
