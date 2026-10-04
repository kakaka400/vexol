'use client';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { SCHEDULE_TIME_ZONE } from '../utils/platforms';
import StudioScheduleForm, { type StudioScheduleDraft } from './StudioScheduleForm';

export default function StudioScheduleDialog({
  projectKey,
  draft,
  onClose,
}: {
  projectKey: string;
  draft: StudioScheduleDraft | null;
  onClose: () => void;
}) {
  return (
    <Dialog open={draft != null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Schedule post</DialogTitle>
          <DialogDescription>
            Zernio publishes it to the chosen accounts at this time ({SCHEDULE_TIME_ZONE}).
          </DialogDescription>
        </DialogHeader>
        {draft && (
          <StudioScheduleForm
            key={draft.id}
            projectKey={projectKey}
            draft={draft}
            onDone={onClose}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
