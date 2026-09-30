'use client';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { useStudioDraftQuery } from '../services/studio.service';
import StudioDraftBody from './StudioDraftBody';

export default function StudioDraftDialog({
  projectKey,
  draftId,
  canEdit,
  onClose,
}: {
  projectKey: string;
  draftId: string | null;
  canEdit: boolean;
  onClose: () => void;
}) {
  const query = useStudioDraftQuery(projectKey, draftId);
  return (
    <Dialog open={draftId != null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Instagram draft</DialogTitle>
          <DialogDescription>
            Every edit is a new version. Only an approved version can be scheduled.
          </DialogDescription>
        </DialogHeader>
        {query.data ? (
          <StudioDraftBody
            key={`${query.data.id}:${query.data.currentVersion}`}
            projectKey={projectKey}
            draft={query.data}
            canEdit={canEdit}
          />
        ) : (
          <Skeleton className="h-64" />
        )}
      </DialogContent>
    </Dialog>
  );
}
