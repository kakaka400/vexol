'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { BlogPost } from '@/lib/api';
import { useApproveBlogDraft, useRejectBlogDraft } from '../services/blog.service';

export default function BlogDraftCard({ post }: { post: BlogPost }) {
  const approve = useApproveBlogDraft();
  const reject = useRejectBlogDraft();
  const isPending = approve.isPending || reject.isPending;

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-4">
          <CardTitle className="text-base">{post.title}</CardTitle>
          {post.category && <Badge variant="secondary">{post.category}</Badge>}
        </div>
        {post.publishedAt && (
          <p className="text-xs text-muted-foreground">
            {new Date(post.publishedAt).toLocaleDateString()}
          </p>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        {post.excerpt && <p className="text-sm text-muted-foreground">{post.excerpt}</p>}
        {post.content && (
          <div
            className="prose prose-sm max-h-40 overflow-hidden text-sm text-muted-foreground [&>*:first-child]:mt-0"
            dangerouslySetInnerHTML={{ __html: post.content }}
          />
        )}
        <div className="flex gap-2 pt-1">
          <Button size="sm" onClick={() => approve.mutate(post.slug)} disabled={isPending}>
            Approve
          </Button>
          <Button
            size="sm"
            variant="destructive"
            onClick={() => reject.mutate(post.slug)}
            disabled={isPending}
          >
            Reject
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
