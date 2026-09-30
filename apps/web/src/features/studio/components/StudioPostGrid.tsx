'use client';

import { useState } from 'react';
import ConfirmDialog from '@/components/common/overlay/ConfirmDialog';
import type { StudioPost } from '@/lib/api';
import { useDeleteStudioPost } from '../services/studio.service';
import StudioPostCard from './StudioPostCard';

export default function StudioPostGrid({
  projectKey,
  posts,
  canDelete,
}: {
  projectKey: string;
  posts: StudioPost[];
  canDelete: boolean;
}) {
  const remove = useDeleteStudioPost(projectKey);
  const [deleting, setDeleting] = useState<StudioPost | null>(null);

  if (posts.length === 0) {
    return (
      <p className="rounded-md border border-dashed p-6 text-sm text-muted-foreground">
        No images yet. Ask the social media agent in Hermes to make one from a template.
      </p>
    );
  }

  return (
    <>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-5">
        {posts.map((post) => (
          <StudioPostCard
            key={post.id}
            post={post}
            canDelete={canDelete}
            onDelete={() => setDeleting(post)}
          />
        ))}
      </div>
      {deleting && (
        <ConfirmDialog
          title="Delete this image?"
          confirmLabel="Delete"
          onConfirm={async () => {
            await remove.mutateAsync(deleting.id);
            setDeleting(null);
          }}
          onClose={() => setDeleting(null)}
        >
          <p className="text-sm text-muted-foreground">
            The image is removed from Studio and from the vault. Its public link stops working.
          </p>
        </ConfirmDialog>
      )}
    </>
  );
}
