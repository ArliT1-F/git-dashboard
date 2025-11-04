import { GitHubUser } from '@/types/github';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { MapPin, Building2, Link as LinkIcon, Calendar } from 'lucide-react';

interface GitHubProfileProps {
  user: GitHubUser;
}

export default function GitHubProfile({ user }: GitHubProfileProps) {
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
    });
  };

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
              href={`https://github.com/${user.login}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:underline font-medium"
            >
              @{user.login}
            </a>
          </div>

          <div className="flex-1 space-y-4">
            {user.name && (
              <h2 className="text-2xl font-bold">{user.name}</h2>
            )}
            
            {user.bio && (
              <p className="text-muted-foreground">{user.bio}</p>
            )}

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
              
              {user.blog && (
                <div className="flex items-center gap-1 text-muted-foreground">
                  <LinkIcon className="w-4 h-4" />
                  <a
                    href={user.blog.startsWith('http') ? user.blog : `https://${user.blog}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:underline"
                  >
                    {user.blog}
                  </a>
                </div>
              )}

              <div className="flex items-center gap-1 text-muted-foreground">
                <Calendar className="w-4 h-4" />
                <span>Joined {formatDate(user.created_at)}</span>
              </div>
            </div>

            <div className="flex flex-wrap gap-4 pt-2">
              <Badge variant="secondary" className="text-base px-4 py-2">
                <span className="font-bold mr-1">{user.public_repos}</span>
                Repositories
              </Badge>
              <Badge variant="secondary" className="text-base px-4 py-2">
                <span className="font-bold mr-1">{user.followers}</span>
                Followers
              </Badge>
              <Badge variant="secondary" className="text-base px-4 py-2">
                <span className="font-bold mr-1">{user.following}</span>
                Following
              </Badge>
              <Badge variant="secondary" className="text-base px-4 py-2">
                <span className="font-bold mr-1">{user.public_gists}</span>
                Gists
              </Badge>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}