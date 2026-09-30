import { ExternalLink, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { StudioPost } from '@/lib/api';
import { formatDateTime } from '@/utils/dates';

export default function StudioPostCard({
  post,
  canDelete,
  onDelete,
}: {
  post: StudioPost;
  canDelete: boolean;
  onDelete: () => void;
}) {
  return (
    <div className="overflow-hidden rounded-lg border bg-card">
      <div className="aspect-[4/5] bg-muted/40">
        {post.imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element -- a public API image URL
          <img
            src={post.imageUrl}
            alt={post.instruction}
            loading="lazy"
            className="size-full object-contain"
          />
        )}
      </div>
      <div className="space-y-2 p-3">
        <p className="line-clamp-3 text-sm">{post.instruction}</p>
        <p className="text-xs text-muted-foreground">
          {post.templateName || `Template ${post.slot}`} · {formatDateTime(post.createdAt)}
          {post.createdByName && ` · ${post.createdByName}`}
        </p>
        <div className="flex gap-2">
          {post.imageUrl && (
            <Button asChild size="sm" variant="outline" className="flex-1">
              <a href={post.imageUrl} target="_blank" rel="noreferrer">
                <ExternalLink className="size-3.5" />
                Open
              </a>
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={onDelete} disabled={!canDelete}>
            <Trash2 className="size-3.5" />
            <span className="sr-only">Delete image</span>
          </Button>
        </div>
      </div>
    </div>
  );
}
