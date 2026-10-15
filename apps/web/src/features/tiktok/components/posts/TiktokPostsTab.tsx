'use client';

import { Skeleton } from '@/components/ui/skeleton';
import { useTiktokPostsQuery } from '../../services/tiktok.service';
import TiktokPostCard from './TiktokPostCard';

export default function TiktokPostsTab({ projectKey }: { projectKey: string }) {
  const posts = useTiktokPostsQuery(projectKey);
  if (posts.isLoading) return <Skeleton className="h-32" />;
  if (posts.isError) return <p className="text-sm text-destructive">{posts.error.message}</p>;
  if (posts.data!.length === 0)
    return <p className="text-sm text-muted-foreground">No TikTok posts yet.</p>;
  return (
    <ul className="max-w-3xl space-y-2">
      {posts.data!.map((post) => (
        <TiktokPostCard key={post.id} projectKey={projectKey} post={post} />
      ))}
    </ul>
  );
}
