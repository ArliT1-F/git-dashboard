import { GitHubRepository } from '@/types/github';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Star, GitFork, Circle, ExternalLink } from 'lucide-react';

interface RepositoryListProps {
  repositories: GitHubRepository[];
}

export default function RepositoryList({ repositories }: RepositoryListProps) {
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffTime = Math.abs(now.getTime() - date.getTime());
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 30) return `${diffDays} days ago`;
    if (diffDays < 365) return `${Math.floor(diffDays / 30)} months ago`;
    return `${Math.floor(diffDays / 365)} years ago`;
  };

  const getLanguageColor = (language: string | null) => {
    const colors: Record<string, string> = {
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
    };
    return colors[language || ''] || '#8b949e';
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>Recent Repositories</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {repositories.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">No repositories found</p>
          ) : (
            repositories.map((repo) => (
              <div
                key={repo.id}
                className="border rounded-lg p-4 hover:bg-accent/50 transition-colors"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2">
                      <a
                        href={repo.html_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-lg font-semibold text-blue-600 hover:underline flex items-center gap-1"
                      >
                        {repo.name}
                        <ExternalLink className="w-4 h-4" />
                      </a>
                      <Badge variant="outline" className="text-xs">
                        Public
                      </Badge>
                    </div>
                    
                    {repo.description && (
                      <p className="text-sm text-muted-foreground mb-3 line-clamp-2">
                        {repo.description}
                      </p>
                    )}
                    
                    <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
                      {repo.language && (
                        <div className="flex items-center gap-1">
                          <Circle
                            className="w-3 h-3"
                            fill={getLanguageColor(repo.language)}
                            color={getLanguageColor(repo.language)}
                          />
                          <span>{repo.language}</span>
                        </div>
                      )}
                      
                      <div className="flex items-center gap-1">
                        <Star className="w-4 h-4" />
                        <span>{repo.stargazers_count}</span>
                      </div>
                      
                      <div className="flex items-center gap-1">
                        <GitFork className="w-4 h-4" />
                        <span>{repo.forks_count}</span>
                      </div>
                      
                      <span>Updated {formatDate(repo.updated_at)}</span>
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}