import { useState, useEffect } from 'react';
import { TimeEntry } from '@/types/github';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Play, Pause, Clock, Trash2 } from 'lucide-react';

export default function TimeTracker() {
  const [isTracking, setIsTracking] = useState(false);
  const [startTime, setStartTime] = useState<number | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [description, setDescription] = useState('');
  const [entries, setEntries] = useState<TimeEntry[]>([]);

  useEffect(() => {
    const savedEntries = localStorage.getItem('timeEntries');
    if (savedEntries) {
      setEntries(JSON.parse(savedEntries));
    }

    const savedTracking = localStorage.getItem('isTracking');
    const savedStartTime = localStorage.getItem('startTime');
    const savedDescription = localStorage.getItem('currentDescription');

    if (savedTracking === 'true' && savedStartTime) {
      setIsTracking(true);
      setStartTime(parseInt(savedStartTime));
      setDescription(savedDescription || '');
    }
  }, []);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    
    if (isTracking && startTime) {
      interval = setInterval(() => {
        setCurrentTime(Date.now() - startTime);
      }, 1000);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isTracking, startTime]);

  const formatDuration = (ms: number) => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    return `${hours.toString().padStart(2, '0')}:${(minutes % 60).toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`;
  };

  const handleStart = () => {
    const now = Date.now();
    setStartTime(now);
    setIsTracking(true);
    localStorage.setItem('isTracking', 'true');
    localStorage.setItem('startTime', now.toString());
    localStorage.setItem('currentDescription', description);
  };

  const handleStop = () => {
    if (startTime) {
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      const newEntry: TimeEntry = {
        id: Date.now().toString(),
        description: description || 'Untitled session',
        startTime,
        endTime,
        duration,
      };

      const updatedEntries = [newEntry, ...entries];
      setEntries(updatedEntries);
      localStorage.setItem('timeEntries', JSON.stringify(updatedEntries));
    }

    setIsTracking(false);
    setStartTime(null);
    setCurrentTime(0);
    setDescription('');
    localStorage.removeItem('isTracking');
    localStorage.removeItem('startTime');
    localStorage.removeItem('currentDescription');
  };

  const handleDelete = (id: string) => {
    const updatedEntries = entries.filter(entry => entry.id !== id);
    setEntries(updatedEntries);
    localStorage.setItem('timeEntries', JSON.stringify(updatedEntries));
  };

  const getTotalTime = () => {
    return entries.reduce((total, entry) => total + entry.duration, 0);
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Clock className="w-5 h-5" />
          Time Tracker
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-6">
          <div className="space-y-4">
            <div className="text-center">
              <div className="text-4xl font-bold font-mono mb-2">
                {formatDuration(currentTime)}
              </div>
              {isTracking && (
                <Badge variant="secondary" className="animate-pulse">
                  Recording...
                </Badge>
              )}
            </div>

            <Input
              placeholder="What are you working on?"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={isTracking}
              className="text-center"
            />

            <div className="flex gap-2">
              {!isTracking ? (
                <Button onClick={handleStart} className="flex-1" size="lg">
                  <Play className="w-4 h-4 mr-2" />
                  Start
                </Button>
              ) : (
                <Button onClick={handleStop} variant="destructive" className="flex-1" size="lg">
                  <Pause className="w-4 h-4 mr-2" />
                  Stop
                </Button>
              )}
            </div>
          </div>

          <div className="border-t pt-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold">Time Logs</h3>
              <Badge variant="outline">
                Total: {formatDuration(getTotalTime())}
              </Badge>
            </div>

            <div className="space-y-2 max-h-64 overflow-y-auto">
              {entries.length === 0 ? (
                <p className="text-muted-foreground text-center py-8 text-sm">
                  No time entries yet
                </p>
              ) : (
                entries.map((entry) => (
                  <div
                    key={entry.id}
                    className="flex items-center justify-between p-3 border rounded-lg hover:bg-accent/50 transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">
                        {entry.description}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(entry.startTime).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary" className="font-mono">
                        {formatDuration(entry.duration)}
                      </Badge>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDelete(entry.id)}
                        className="h-8 w-8"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}