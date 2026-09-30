import { GitHubEvent } from '@/types/github'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { formatRelativeTime } from '@/lib/dates'
import { pluralize } from '@/lib/format'
import {
  BookMarked,
  GitCommit,
  GitFork,
  GitPullRequest,
  MessageSquare,
  Package,
  Star,
  Tag,
  UserPlus,
} from 'lucide-react'
import type { ReactElement } from 'react'

interface ContributionActivityProps {
  events: GitHubEvent[]
  loadingMore?: boolean
  onLoadMore?: () => void
  hasMore?: boolean
}

type EventMeta = { icon: ReactElement; color: string; badge: string }

const EVENT_META: Record<string, EventMeta> = {
  PushEvent: { icon: <GitCommit className="w-3 h-3" />, color: 'bg-green-600', badge: 'Push' },
  PullRequestEvent: {
    icon: <GitPullRequest className="w-3 h-3" />,
    color: 'bg-purple-600',
    badge: 'Pull request',
  },
  PullRequestReviewEvent: {
    icon: <MessageSquare className="w-3 h-3" />,
    color: 'bg-fuchsia-600',
    badge: 'Review',
  },
  IssuesEvent: { icon: <BookMarked className="w-3 h-3" />, color: 'bg-orange-600', badge: 'Issue' },
  IssueCommentEvent: {
    icon: <MessageSquare className="w-3 h-3" />,
    color: 'bg-amber-600',
    badge: 'Comment',
  },
  WatchEvent: { icon: <Star className="w-3 h-3" />, color: 'bg-yellow-600', badge: 'Star' },
  ForkEvent: { icon: <GitFork className="w-3 h-3" />, color: 'bg-blue-600', badge: 'Fork' },
  CreateEvent: { icon: <Package className="w-3 h-3" />, color: 'bg-indigo-600', badge: 'Create' },
  DeleteEvent: { icon: <Package className="w-3 h-3" />, color: 'bg-slate-600', badge: 'Delete' },
  ReleaseEvent: { icon: <Tag className="w-3 h-3" />, color: 'bg-teal-600', badge: 'Release' },
  FollowEvent: { icon: <UserPlus className="w-3 h-3" />, color: 'bg-cyan-600', badge: 'Follow' },
  PublicEvent: { icon: <Star className="w-3 h-3" />, color: 'bg-lime-600', badge: 'Public' },
}

const getEventMeta = (type: string): EventMeta =>
  EVENT_META[type] ?? {
    icon: <GitCommit className="w-3 h-3" />,
    color: 'bg-gray-600',
    badge: type.replace('Event', '') || 'Activity',
  }

const repoName = (event: GitHubEvent) =>
  event.repo?.name?.split('/')?.[1] || event.repo?.name || 'unknown repository'

const repoUrl = (event: GitHubEvent) =>
  event.repo?.name ? `https://github.com/${event.repo.name}` : undefined

const getEventDescription = (event: GitHubEvent) => {
  const name = repoName(event)
  const payload = event.payload ?? {}

  switch (event.type) {
    case 'PushEvent': {
      // `size` is the total number of commits in the push; the `commits` array
      // is capped by GitHub and is therefore incomplete for large pushes.
      const commitCount = payload.size ?? payload.commits?.length ?? 0
      const branch = payload.ref?.replace('refs/heads/', '')
      return `Pushed ${pluralize(commitCount, 'commit')} to ${name}${branch ? ` (${branch})` : ''}`
    }
    case 'PullRequestEvent': {
      const number = payload.pull_request?.number
      const action = payload.pull_request?.merged ? 'merged' : payload.action || 'updated'
      return `${action} pull request${number ? ` #${number}` : ''} in ${name}`
    }
    case 'PullRequestReviewEvent':
      return `${payload.action || 'reviewed'} a pull request in ${name}`
    case 'WatchEvent':
      return `Starred ${name}`
    case 'ForkEvent':
      return `Forked ${name}`
    case 'CreateEvent':
      return `Created ${payload.ref_type || 'resource'}${payload.ref ? ` ${payload.ref}` : ''} in ${name}`
    case 'DeleteEvent':
      return `Deleted ${payload.ref_type || 'resource'}${payload.ref ? ` ${payload.ref}` : ''} in ${name}`
    case 'IssuesEvent':
      return `${payload.action || 'updated'} issue${payload.issue?.number ? ` #${payload.issue.number}` : ''} in ${name}`
    case 'IssueCommentEvent':
      return `Commented on an issue in ${name}`
    case 'ReleaseEvent':
      return `Published release ${payload.release?.tag_name || ''} in ${name}`.replace('  ', ' ')
    case 'FollowEvent':
      return 'Started following someone'
    case 'PublicEvent':
      return `Made ${name} public`
    default:
      return `Activity in ${name}`
  }
}

export default function ContributionActivity({
  events,
  loadingMore = false,
  onLoadMore,
  hasMore = false,
}: ContributionActivityProps) {
  const uniqueRepos = new Set(events.map((event) => event.repo?.name).filter(Boolean)).size

  const lastCommitMessage = (event: GitHubEvent) => {
    if (event.type !== 'PushEvent') return null
    const message = event.payload.commits?.[0]?.message
    return message ? message.split('\n')[0] : null
  }

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>Recent Activity</CardTitle>
        {events.length > 0 && (
          <CardDescription>
            {pluralize(events.length, 'public event')} across {pluralize(uniqueRepos, 'repository', 'repositories')}.
          </CardDescription>
        )}
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {events.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">No recent activity</p>
          ) : (
            <div className="relative">
              <div className="absolute left-[9px] top-2 bottom-2 w-[2px] bg-border" />

              {events.map((event) => {
                const meta = getEventMeta(event.type)
                const message = lastCommitMessage(event)
                const url = repoUrl(event)
                const prUrl = event.payload.pull_request?.html_url
                const issueUrl = event.payload.issue?.html_url

                return (
                  <div key={event.id} className="relative flex gap-4 pb-6 last:pb-0">
                    <div
                      className={`relative z-10 flex h-5 w-5 items-center justify-center rounded-full ${meta.color}`}
                    >
                      <div className="text-white">{meta.icon}</div>
                    </div>

                    <div className="flex-1 pt-0.5">
                      <div className="mb-1 flex items-center gap-2">
                        <p className="text-sm font-medium">
                          {getEventDescription(event)}
                        </p>
                        <Badge variant="outline" className="text-xs">
                          {meta.badge}
                        </Badge>
                      </div>

                      <p className="text-xs text-muted-foreground">
                        <span title={new Date(event.created_at).toISOString()}>
                          {formatRelativeTime(event.created_at)}
                        </span>
                        {url && (
                          <>
                            {' · '}
                            <a
                              href={url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="hover:underline"
                            >
                              {event.repo.name}
                            </a>
                          </>
                        )}
                        {prUrl && (
                          <>
                            {' · '}
                            <a
                              href={prUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="hover:underline"
                            >
                              View PR
                            </a>
                          </>
                        )}
                        {issueUrl && (
                          <>
                            {' · '}
                            <a
                              href={issueUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="hover:underline"
                            >
                              View issue
                            </a>
                          </>
                        )}
                      </p>

                      {message && (
                        <div className="mt-2 text-xs text-muted-foreground">
                          <p className="line-clamp-1 font-mono">{message}</p>
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {onLoadMore && (hasMore || loadingMore) && (
            <button
              type="button"
              onClick={onLoadMore}
              disabled={loadingMore}
              className="w-full rounded-md border border-dashed py-2 text-xs text-muted-foreground transition-colors hover:bg-accent/50 disabled:opacity-60"
            >
              {loadingMore ? 'Loading more activity…' : 'Load more activity'}
            </button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
