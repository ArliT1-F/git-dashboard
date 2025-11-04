import { GitHubEvent } from '@/types/github';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { GitCommit, GitPullRequest, Star, GitFork, Package } from 'lucide-react';

interface ContributionActivityProps {
  events: GitHubEvent[];
}

export default function ContributionActivity({ events }: ContributionActivityProps) {
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffTime = Math.abs(now.getTime() - date.getTime());
    const diffHours = Math.floor(diffTime / (1000 * 60 * 60));
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffHours < 1) return 'Just now';
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const getEventIcon = (type: string) => {
    switch (type) {
      case 'PushEvent':
        return <GitCommit className="w-4 h-4" />;
      case 'PullRequestEvent':
        return <GitPullRequest className="w-4 h-4" />;
      case 'WatchEvent':
        return <Star className="w-4 h-4" />;
      case 'ForkEvent':
        return <GitFork className="w-4 h-4" />;
      case 'CreateEvent':
        return <Package className="w-4 h-4" />;
      default:
        return <GitCommit className="w-4 h-4" />;
    }
  };

  const getEventDescription = (event: GitHubEvent) => {
    const repoName = event.repo.name.split('/')[1];
    
    switch (event.type) {
      case 'PushEvent': {
        const commitCount = event.payload.commits?.length || 0;
        return `Pushed ${commitCount} commit${commitCount !== 1 ? 's' : ''} to ${repoName}`;
      }
      case 'PullRequestEvent':
        return `${event.payload.action} a pull request in ${repoName}`;
      case 'WatchEvent':
        return `Starred ${repoName}`;
      case 'ForkEvent':
        return `Forked ${repoName}`;
      case 'CreateEvent':
        return `Created ${event.payload.ref_type} in ${repoName}`;
      case 'IssuesEvent':
        return `${event.payload.action} an issue in ${repoName}`;
      default:
        return `Activity in ${repoName}`;
    }
  };

  const getEventColor = (type: string) => {
    switch (type) {
      case 'PushEvent':
        return 'bg-green-500';
      case 'PullRequestEvent':
        return 'bg-purple-500';
      case 'WatchEvent':
        return 'bg-yellow-500';
      case 'ForkEvent':
        return 'bg-blue-500';
      case 'CreateEvent':
        return 'bg-indigo-500';
      default:
        return 'bg-gray-500';
    }
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>Recent Activity</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {events.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">No recent activity</p>
          ) : (
            <div className="relative">
              <div className="absolute left-[9px] top-2 bottom-2 w-[2px] bg-border" />
              
              {events.map((event) => (
                <div key={event.id} className="relative flex gap-4 pb-6 last:pb-0">
                  <div className={`relative z-10 flex items-center justify-center w-5 h-5 rounded-full ${getEventColor(event.type)}`}>
                    <div className="text-white">
                      {getEventIcon(event.type)}
                    </div>
                  </div>
                  
                  <div className="flex-1 pt-0.5">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="text-sm font-medium">
                        {getEventDescription(event)}
                      </p>
                      <Badge variant="outline" className="text-xs">
                        {event.type.replace('Event', '')}
                      </Badge>
                    </div>
                    
                    <p className="text-xs text-muted-foreground">
                      {formatDate(event.created_at)}
                    </p>
                    
                    {event.type === 'PushEvent' && event.payload.commits && event.payload.commits.length > 0 && (
                      <div className="mt-2 text-xs text-muted-foreground">
                        <p className="line-clamp-1">
                          {event.payload.commits[0].message}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}