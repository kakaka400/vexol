'use client';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { TwitterDraft } from '@/lib/api';
import TwitterPublishForm from './TwitterPublishForm';

export default function TwitterPublishDialog({
  draft,
  onClose,
}: {
  draft: TwitterDraft | null;
  onClose: () => void;
}) {
  return (
    <Dialog open={draft != null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Preview and publish</DialogTitle>
          <DialogDescription>
            Buffer posts the confirmed version to the chosen X account. Nothing is sent until you
            confirm.
          </DialogDescription>
        </DialogHeader>
        {draft && (
          <TwitterPublishForm
            key={`${draft.id}-${draft.currentVersion}`}
            draft={draft}
            onDone={onClose}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
