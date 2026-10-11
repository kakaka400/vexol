'use client';

import { useSession } from '@/lib/auth-client';
import SectionPageView from '@/components/common/page/SectionPageView';
import BlogDraftCard from './components/BlogDraftCard';
import BlogPublishedList from './components/BlogPublishedList';
import { useBlogDraftsQuery, useBlogPublishedQuery } from './services/blog.service';

export default function BlogPage() {
  const { data: session } = useSession();
  const isGod = session?.user?.role === 'god';
  const draftsQuery = useBlogDraftsQuery();
  const publishedQuery = useBlogPublishedQuery();

  if (!isGod) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        You do not have access to this page.
      </div>
    );
  }

  const drafts = draftsQuery.data ?? [];
  const published = publishedQuery.data ?? [];

  return (
    <SectionPageView
      title="Blog"
      description="Review Framer CMS draft posts and approve or reject them before they go live."
    >
      <div className="space-y-8 pb-8">
        <section>
          <h2 className="mb-4 text-sm font-semibold tracking-wide text-muted-foreground uppercase">
            Pending review
          </h2>
          {draftsQuery.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : drafts.length === 0 ? (
            <p className="text-sm text-muted-foreground">No drafts pending review.</p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {drafts.map((post) => (
                <BlogDraftCard key={post.id} post={post} />
              ))}
            </div>
          )}
        </section>

        <section>
          <h2 className="mb-4 text-sm font-semibold tracking-wide text-muted-foreground uppercase">
            Published
          </h2>
          {publishedQuery.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : (
            <BlogPublishedList posts={published} />
          )}
        </section>
      </div>
    </SectionPageView>
  );
}
