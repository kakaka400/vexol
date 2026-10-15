'use client';

import { RefreshCw } from 'lucide-react';
import type { TiktokPost } from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useRefreshTiktokPost } from '../../services/tiktok.service';
import { formatDate, safeHref, STATUS_LABEL } from '../../utils/tiktok';

const TONE: Record<TiktokPost['status'], string> = {
  pending: 'text-muted-foreground',
  unknown: 'text-muted-foreground',
  scheduled: 'text-muted-foreground',
  published: 'border-transparent bg-secondary text-secondary-foreground',
  failed: 'border-transparent bg-destructive text-white',
};

export default function TiktokPostCard({
  projectKey,
  post,
}: {
  projectKey: string;
  post: TiktokPost;
}) {
  const refresh = useRefreshTiktokPost(projectKey);
  const link = safeHref(post.platformPostUrl);
  const video = safeHref(post.videoUrl);
  return (
    <li className="space-y-2 rounded-md bg-muted/40 p-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline" className={cn(TONE[post.status])}>
          {STATUS_LABEL[post.status]}
        </Badge>
        <span className="text-muted-foreground">
          {post.mode === 'now' ? 'Post now' : `Scheduled for ${formatDate(post.scheduledFor)}`} ·{' '}
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
      {post.caption && <p className="line-clamp-3 whitespace-pre-wrap">{post.caption}</p>}
      <p className="text-xs text-muted-foreground">
        By {post.createdByName ?? 'unknown'} on {formatDate(post.createdAt)}
        {video && (
          <>
            {' · '}
            <a href={video} target="_blank" rel="noopener noreferrer" className="underline">
              video
            </a>
          </>
        )}
        {link && (
          <>
            {' · '}
            <a href={link} target="_blank" rel="noopener noreferrer" className="underline">
              view on TikTok
            </a>
          </>
        )}
      </p>
      {post.lastError && <p className="text-xs text-destructive">{post.lastError}</p>}
    </li>
  );
}
