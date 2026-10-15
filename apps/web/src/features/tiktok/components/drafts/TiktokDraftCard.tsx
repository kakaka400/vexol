'use client';

import { Pencil, Send, Trash2 } from 'lucide-react';
import type { TiktokDraft } from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatDate, safeHref } from '../../utils/tiktok';
import TiktokColorSwatches from '../TiktokColorSwatches';

export default function TiktokDraftCard({
  draft,
  onEdit,
  onPublish,
  onDelete,
}: {
  draft: TiktokDraft;
  onEdit: (() => void) | null;
  onPublish: (() => void) | null;
  onDelete: (() => void) | null;
}) {
  const video = safeHref(draft.videoUrl);
  return (
    <li className="flex flex-col gap-3 rounded-lg border p-4 text-sm">
      {video ? (
        <video
          src={video}
          controls
          preload="metadata"
          className="aspect-[9/16] max-h-80 w-full rounded-md bg-black object-contain"
        />
      ) : (
        <div className="flex aspect-[9/16] max-h-80 w-full items-center justify-center rounded-md bg-muted text-xs text-muted-foreground">
          No video yet
        </div>
      )}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="truncate font-medium">{draft.title}</h3>
          <p className="text-xs text-muted-foreground">
            {draft.durationSeconds}s{draft.style && ` · ${draft.style}`} · by{' '}
            {draft.createdByName ?? 'unknown'} · {formatDate(draft.updatedAt)}
          </p>
        </div>
        <Badge variant={video ? 'secondary' : 'outline'}>{video ? 'Video ready' : 'Draft'}</Badge>
      </div>
      <p className="line-clamp-3 whitespace-pre-wrap text-muted-foreground">{draft.prompt}</p>
      <TiktokColorSwatches colors={draft.colors} />
      {draft.caption && <p className="line-clamp-2 whitespace-pre-wrap">{draft.caption}</p>}
      <div className="mt-auto flex flex-wrap justify-end gap-1">
        {onDelete && (
          <Button size="sm" variant="ghost" onClick={onDelete}>
            <Trash2 className="size-3.5" /> Delete
          </Button>
        )}
        {onEdit && (
          <Button size="sm" variant="outline" onClick={onEdit}>
            <Pencil className="size-3.5" /> Edit
          </Button>
        )}
        {onPublish && (
          <Button size="sm" disabled={!video} onClick={onPublish}>
            <Send className="size-3.5" /> Post
          </Button>
        )}
      </div>
    </li>
  );
}
