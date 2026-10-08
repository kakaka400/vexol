'use client';

import { useState } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { useTwitter } from '../../context/TwitterContext';
import { useTwitterActivityQuery } from '../../services/twitter.service';
import { formatDate } from '../../utils/twitter';

const EVENTS = [
  ['all', 'All events'],
  ['twitter.research', 'Research runs'],
  ['mcp.call', 'MCP calls'],
  ['obsidian.ingest', 'Obsidian'],
  ['twitter.draft', 'Drafts'],
  ['twitter.publish', 'Publications'],
] as const;

// The audit log: what happened, who did it, and the correlation id that ties a
// research run, its notes, the draft and the publication together.
export default function TwitterActivityList() {
  const { projectKey } = useTwitter();
  const [event, setEvent] = useState('all');
  const [level, setLevel] = useState('all');
  const activity = useTwitterActivityQuery(projectKey, {
    event: event === 'all' ? undefined : event,
    level: level === 'all' ? undefined : level,
  });

  return (
    <section className="min-w-0 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-medium">Activity</h2>
        <div className="flex gap-2">
          <Select value={event} onValueChange={setEvent}>
            <SelectTrigger size="sm" className="w-40" aria-label="Event">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {EVENTS.map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={level} onValueChange={setLevel}>
            <SelectTrigger size="sm" className="w-32" aria-label="Level">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Any level</SelectItem>
              <SelectItem value="error">Errors</SelectItem>
              <SelectItem value="warning">Warnings</SelectItem>
              <SelectItem value="info">Info</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      {activity.isLoading ? (
        <Skeleton className="h-64" />
      ) : (activity.data ?? []).length === 0 ? (
        <p className="text-sm text-muted-foreground">No activity yet.</p>
      ) : (
        <ul className="divide-y">
          {activity.data!.map((entry) => (
            <li key={entry.id} className="space-y-0.5 py-2.5 text-sm">
              <p className={cn('break-words', entry.level === 'error' && 'text-destructive')}>
                {entry.summary}
              </p>
              <p className="flex flex-wrap gap-x-3 text-xs text-muted-foreground">
                <span>{formatDate(entry.createdAt)}</span>
                <span className="font-mono">{entry.event}</span>
                {entry.actorName && <span>by {entry.actorName}</span>}
                {entry.correlationId && (
                  <span className="font-mono" title="Correlation id">
                    {entry.correlationId.slice(0, 8)}
                  </span>
                )}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
