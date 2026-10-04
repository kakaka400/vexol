'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import type { StudioDraftDetail } from '@/lib/api';
import { useStudioDraftAction } from '../services/studio.service';
import StudioDraftActions from './StudioDraftActions';
import StudioDraftHistory from './StudioDraftHistory';
import StudioDraftStatusBadge from './StudioDraftStatusBadge';

// Mounted per version (see the key in StudioDraftDialog), so the caption field
// starts from the current version's text.
export default function StudioDraftBody({
  projectKey,
  draft,
  canEdit,
}: {
  projectKey: string;
  draft: StudioDraftDetail;
  canEdit: boolean;
}) {
  const action = useStudioDraftAction(projectKey, draft.id);
  const current = draft.versions.find((version) => version.version === draft.currentVersion)!;
  const [caption, setCaption] = useState(current.caption);
  const locked = draft.status === 'scheduled';
  const edited = caption.trim() !== current.caption;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <StudioDraftStatusBadge status={draft.status} />
        <span className="text-muted-foreground">
          Version {draft.currentVersion} of {draft.versions.length}
        </span>
      </div>

      {current.imageUrl && (
        // eslint-disable-next-line @next/next/no-img-element -- a public API image URL
        <img
          src={current.imageUrl}
          alt="Draft image"
          className="max-h-80 w-full rounded-md border bg-muted/40 object-contain"
        />
      )}

      <div className="space-y-1.5">
        <Label htmlFor="studio-draft-caption">Caption</Label>
        <Textarea
          id="studio-draft-caption"
          value={caption}
          onChange={(event) => setCaption(event.target.value)}
          maxLength={2200}
          readOnly={!canEdit || locked}
          className="min-h-40"
        />
        {canEdit && !locked && (
          <div className="flex justify-end">
            <Button
              size="sm"
              variant="outline"
              disabled={!edited || !caption.trim() || action.isPending}
              onClick={() =>
                action.mutate({
                  action: 'versions',
                  body: {
                    baseVersion: draft.currentVersion,
                    caption: caption.trim(),
                    templateSlot: current.templateSlot,
                    postId: current.postId,
                  },
                })
              }
            >
              Save as version {draft.currentVersion + 1}
            </Button>
          </div>
        )}
      </div>

      {canEdit && !edited && (
        <StudioDraftActions projectKey={projectKey} draft={draft} action={action} />
      )}

      <StudioDraftHistory versions={draft.versions} />
    </div>
  );
}
