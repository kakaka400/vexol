import { AlertTriangle, CircleX } from 'lucide-react';
import type { TwitterPreview } from '@/lib/api';
import { cn } from '@/lib/utils';

// The draft as it would go out on X: each post with its character count, the
// images on the first post, the blocking issues, and the warnings.
export default function TwitterPreviewBody({ preview }: { preview: TwitterPreview }) {
  return (
    <div className="space-y-3">
      <ol className="space-y-2">
        {preview.posts.map((post) => (
          <li key={post.index} className="rounded-lg bg-muted/40 p-3">
            <p className="text-sm break-words whitespace-pre-wrap">{post.text}</p>
            {post.index === 0 && preview.media.length > 0 && (
              <div className="mt-2 grid grid-cols-4 gap-1">
                {preview.media.map((media) =>
                  media.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- a public API image URL
                    <img
                      key={media.id}
                      src={media.imageUrl}
                      alt=""
                      className="aspect-square rounded object-cover"
                    />
                  ) : null,
                )}
              </div>
            )}
            <p
              className={cn(
                'mt-1 text-right text-xs tabular-nums',
                post.overLimit ? 'text-destructive' : 'text-muted-foreground',
              )}
            >
              {preview.posts.length > 1 && `${post.index + 1}/${preview.posts.length} · `}
              {post.length}/{preview.maxLength}
            </p>
          </li>
        ))}
      </ol>
      {preview.issues.map((issue) => (
        <p key={issue} className="flex items-start gap-2 text-sm text-destructive">
          <CircleX className="mt-0.5 size-4 shrink-0" /> {issue}
        </p>
      ))}
      {preview.warnings.map((warning) => (
        <p key={warning} className="flex items-start gap-2 text-sm text-muted-foreground">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" /> {warning}
        </p>
      ))}
      <p className="text-xs text-muted-foreground">
        {preview.sources.length > 0
          ? `Based on ${preview.sources.length} source${preview.sources.length === 1 ? '' : 's'}: ${preview.sources.map((s) => `@${s.authorHandle}`).join(', ')}`
          : 'No sources linked.'}
      </p>
    </div>
  );
}
