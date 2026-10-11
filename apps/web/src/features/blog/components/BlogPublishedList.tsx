'use client';

import type { BlogPost } from '@/lib/api';

export default function BlogPublishedList({ posts }: { posts: BlogPost[] }) {
  if (posts.length === 0) {
    return <p className="text-sm text-muted-foreground">No published posts yet.</p>;
  }

  return (
    <ul className="divide-y">
      {posts.map((post) => (
        <li key={post.id} className="flex items-center justify-between gap-4 py-3">
          <div>
            <a
              href={`https://vexol.eu/blog/${post.slug}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm font-medium hover:underline"
            >
              {post.title}
            </a>
            {post.category && (
              <span className="ml-2 text-xs text-muted-foreground">{post.category}</span>
            )}
          </div>
          {post.publishedAt && (
            <span className="shrink-0 text-xs text-muted-foreground">
              {new Date(post.publishedAt).toLocaleDateString()}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}
