'use client';

import { useState } from 'react';
import { Plus } from 'lucide-react';
import type { TiktokDraft } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useDeleteTiktokDraft, useTiktokDraftsQuery } from '../../services/tiktok.service';
import TiktokDraftCard from './TiktokDraftCard';
import TiktokDraftDialog from './TiktokDraftDialog';
import TiktokPublishDialog from './TiktokPublishDialog';

export default function TiktokDraftsTab({
  projectKey,
  canCreate,
  canEdit,
  canDelete,
}: {
  projectKey: string;
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
}) {
  const drafts = useTiktokDraftsQuery(projectKey);
  const remove = useDeleteTiktokDraft(projectKey);
  const [editing, setEditing] = useState<{ draft: TiktokDraft | null } | null>(null);
  const [publishing, setPublishing] = useState<TiktokDraft | null>(null);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          Videos in the making. The agent adds the video once it is rendered.
        </p>
        {canCreate && (
          <Button size="sm" onClick={() => setEditing({ draft: null })}>
            <Plus className="size-3.5" /> New draft
          </Button>
        )}
      </div>
      {drafts.isLoading ? (
        <Skeleton className="h-60" />
      ) : drafts.isError ? (
        <p className="text-sm text-destructive">{drafts.error.message}</p>
      ) : drafts.data!.length === 0 ? (
        <p className="text-sm text-muted-foreground">No drafts yet.</p>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {drafts.data!.map((draft) => (
            <TiktokDraftCard
              key={draft.id}
              draft={draft}
              onEdit={canEdit ? () => setEditing({ draft }) : null}
              onPublish={canCreate ? () => setPublishing(draft) : null}
              onDelete={canDelete ? () => remove.mutate(draft.id) : null}
            />
          ))}
        </ul>
      )}
      <TiktokDraftDialog
        projectKey={projectKey}
        open={editing != null}
        draft={editing?.draft ?? null}
        onClose={() => setEditing(null)}
      />
      <TiktokPublishDialog
        projectKey={projectKey}
        draft={publishing}
        onClose={() => setPublishing(null)}
      />
    </div>
  );
}
