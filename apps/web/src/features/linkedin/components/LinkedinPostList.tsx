'use client';

import { Skeleton } from '@/components/ui/skeleton';
import { useLinkedinPostsQuery } from '../services/linkedin.service';
import LinkedinPostCard from './LinkedinPostCard';

export default function LinkedinPostList({ projectKey }: { projectKey: string }) {
  const posts = useLinkedinPostsQuery(projectKey);
  return (
    <section className="space-y-3">
      <h2 className="text-sm font-medium">Posts</h2>
      {posts.isLoading ? (
        <Skeleton className="h-32" />
      ) : posts.isError ? (
        <p className="text-sm text-destructive">{posts.error.message}</p>
      ) : posts.data!.length === 0 ? (
        <p className="text-sm text-muted-foreground">No LinkedIn posts yet.</p>
      ) : (
        <ul className="space-y-2">
          {posts.data!.map((post) => (
            <LinkedinPostCard key={post.id} projectKey={projectKey} post={post} />
          ))}
        </ul>
      )}
    </section>
  );
}
