'use client';

import type { TiktokDraft } from '@/lib/api';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import TiktokDraftForm from './TiktokDraftForm';

// Creates a draft, or edits `draft` when one is given.
export default function TiktokDraftDialog({
  projectKey,
  open,
  draft,
  onClose,
}: {
  projectKey: string;
  open: boolean;
  draft: TiktokDraft | null;
  onClose: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{draft ? 'Edit draft' : 'New draft'}</DialogTitle>
        </DialogHeader>
        {open && (
          <TiktokDraftForm
            key={draft?.id ?? 'new'}
            projectKey={projectKey}
            draft={draft}
            onDone={onClose}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
