'use client';

import type { TiktokDraft } from '@/lib/api';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import TiktokPublishForm from './TiktokPublishForm';

export default function TiktokPublishDialog({
  projectKey,
  draft,
  onClose,
}: {
  projectKey: string;
  draft: TiktokDraft | null;
  onClose: () => void;
}) {
  return (
    <Dialog open={draft != null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Post to TikTok</DialogTitle>
          <DialogDescription>
            Buffer posts the video and caption of this draft to the chosen TikTok account.
          </DialogDescription>
        </DialogHeader>
        {draft && (
          <TiktokPublishForm
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
