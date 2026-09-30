import { useState } from 'react'
import { GitHubUser } from '@/types/github'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { formatCompactNumber, formatNumber, normaliseUrl } from '@/lib/format'
import { formatMonthYear } from '@/lib/dates'
import {
  AtSign,
  Briefcase,
  Building2,
  Calendar,
  Check,
  Copy,
  ExternalLink,
  Link as LinkIcon,
  MapPin,
  Users,
} from 'lucide-react'

interface GitHubProfileProps {
  user: GitHubUser
}

const StatBadge = ({
  value,
  label,
  title,
}: {
  value: number
  label: string
  title?: string
}) => (
  <Badge variant="secondary" className="text-sm px-3 py-2" title={title ?? `${formatNumber(value)} ${label}`}>
    <span className="font-bold mr-1">{formatCompactNumber(value)}</span>
    {label}
  </Badge>
)

export default function GitHubProfile({ user }: GitHubProfileProps) {
  const [copied, setCopied] = useState(false)
  const profileUrl = `https://github.com/${user.login}`
  const blogUrl = normaliseUrl(user.blog)

  const copyProfileUrl = async () => {
    try {
      await navigator.clipboard.writeText(profileUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard access can be blocked (insecure context); silently ignore.
    }
  }

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>GitHub Profile</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col md:flex-row gap-6">
          <div className="flex flex-col items-center md:items-start">
            <Avatar className="w-32 h-32 mb-4">
              <AvatarImage src={user.avatar_url} alt={user.login} />
              <AvatarFallback>{user.login.slice(0, 2).toUpperCase()}</AvatarFallback>
            </Avatar>
            <a
              href={profileUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-400 hover:underline font-medium"
            >
              @{user.login}
            </a>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={copyProfileUrl}
              className="mt-1 h-7 gap-1 px-2 text-xs text-muted-foreground"
            >
              {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
              {copied ? 'Copied' : 'Copy link'}
            </Button>
          </div>

          <div className="flex-1 space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              {user.name && <h2 className="text-2xl font-bold">{user.name}</h2>}
              {user.type && user.type !== 'User' && (
                <Badge variant="outline" className="text-xs">
                  {user.type}
                </Badge>
              )}
              {user.hireable && (
                <Badge variant="default" className="text-xs">
                  <Briefcase className="w-3 h-3 mr-1" />
                  Open to work
                </Badge>
              )}
            </div>

            {user.bio && <p className="text-muted-foreground">{user.bio}</p>}

            <div className="flex flex-wrap gap-4 text-sm">
              {user.location && (
                <div className="flex items-center gap-1 text-muted-foreground">
                  <MapPin className="w-4 h-4" />
                  <span>{user.location}</span>
                </div>
              )}

              {user.company && (
                <div className="flex items-center gap-1 text-muted-foreground">
                  <Building2 className="w-4 h-4" />
                  <span>{user.company}</span>
                </div>
              )}

              {blogUrl && (
                <div className="flex items-center gap-1 text-muted-foreground">
                  <LinkIcon className="w-4 h-4" />
                  <a
                    href={blogUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:underline max-w-[16rem] truncate"
                  >
                    {user.blog?.replace(/^https?:\/\//, '')}
                  </a>
                </div>
              )}

              <div className="flex items-center gap-1 text-muted-foreground">
                <Calendar className="w-4 h-4" />
                <span>Joined {formatMonthYear(user.created_at)}</span>
              </div>

              {user.twitter_username && (
                <div className="flex items-center gap-1 text-muted-foreground">
                  <AtSign className="w-4 h-4" />
                  <a
                    href={`https://twitter.com/${user.twitter_username}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:underline"
                  >
                    @{user.twitter_username}
                  </a>
                </div>
              )}

              <div className="flex items-center gap-1 text-muted-foreground">
                <Users className="w-4 h-4" />
                <a
                  href={`${profileUrl}?tab=followers`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:underline"
                >
                  {formatNumber(user.followers)} followers
                </a>
                <span>·</span>
                <a
                  href={`${profileUrl}?tab=following`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:underline"
                >
                  {formatNumber(user.following)} following
                </a>
              </div>
            </div>

            <div className="flex flex-wrap gap-3 pt-2">
              <StatBadge value={user.public_repos} label="Repositories" />
              <StatBadge value={user.followers} label="Followers" />
              <StatBadge value={user.following} label="Following" />
              <StatBadge value={user.public_gists} label="Gists" />
              <Button asChild variant="outline" size="sm" className="h-9">
                <a href={`${profileUrl}?tab=repositories`} target="_blank" rel="noopener noreferrer">
                  View on GitHub
                  <ExternalLink className="ml-1 h-3 w-3" />
                </a>
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
