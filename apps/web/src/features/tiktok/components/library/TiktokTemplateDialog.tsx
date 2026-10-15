'use client';

import type { TiktokTemplate } from '@/lib/api';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import TiktokTemplateForm from './TiktokTemplateForm';

// Creates a template, or edits `template` when one is given.
export default function TiktokTemplateDialog({
  projectKey,
  open,
  template,
  onClose,
}: {
  projectKey: string;
  open: boolean;
  template: TiktokTemplate | null;
  onClose: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{template ? 'Edit template' : 'New template'}</DialogTitle>
        </DialogHeader>
        {open && (
          <TiktokTemplateForm
            key={template?.id ?? 'new'}
            projectKey={projectKey}
            template={template}
            onDone={onClose}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
