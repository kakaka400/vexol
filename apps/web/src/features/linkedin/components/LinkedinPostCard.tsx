'use client';

import { RefreshCw } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { LinkedinPost } from '@/lib/api';
import { cn } from '@/lib/utils';
import { useRefreshLinkedinPost } from '../services/linkedin.service';
import { formatDate, safeHref, STATUS_LABEL } from '../utils/linkedin';

const TONE: Record<LinkedinPost['status'], string> = {
  pending: 'text-muted-foreground',
  unknown: 'text-muted-foreground',
  scheduled: 'text-muted-foreground',
  published: 'border-transparent bg-secondary text-secondary-foreground',
  failed: 'border-transparent bg-destructive text-white',
};

export default function LinkedinPostCard({
  projectKey,
  post,
}: {
  projectKey: string;
  post: LinkedinPost;
}) {
  const refresh = useRefreshLinkedinPost(projectKey);
  const link = safeHref(post.platformPostUrl);
  return (
    <li className="space-y-2 rounded-md bg-muted/40 p-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline" className={cn(TONE[post.status])}>
          {STATUS_LABEL[post.status]}
        </Badge>
        <span className="text-muted-foreground">
          {post.mode === 'now' ? 'Publish now' : `Scheduled for ${formatDate(post.scheduledFor)}`} ·{' '}
          {post.channelName ?? post.channelId}
        </span>
        {(post.status === 'scheduled' || post.status === 'unknown') && (
          <Button
            size="sm"
            variant="ghost"
            disabled={refresh.isPending}
            onClick={() => refresh.mutate(post.id)}
          >
            <RefreshCw className="size-3.5" /> Refresh status
          </Button>
        )}
      </div>
      <p className="line-clamp-4 whitespace-pre-wrap">{post.text}</p>
      <p className="text-xs text-muted-foreground">
        By {post.createdByName ?? 'unknown'} on {formatDate(post.createdAt)}
        {post.imageUrls.length > 0 && ` · ${post.imageUrls.length} image(s)`}
        {link && (
          <>
            {' · '}
            <a href={link} target="_blank" rel="noopener noreferrer" className="underline">
              view on LinkedIn
            </a>
          </>
        )}
      </p>
      {post.lastError && <p className="text-xs text-destructive">{post.lastError}</p>}
    </li>
  );
}
