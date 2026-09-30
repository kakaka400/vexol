'use client';

import { useState } from 'react';
import type { StudioTemplate } from '@/lib/api';
import { useUpdateStudioTemplate, useUploadStudioTemplatePhoto } from '../services/studio.service';
import StudioTemplateCard from './StudioTemplateCard';
import StudioTemplateDialog from './StudioTemplateDialog';

export default function StudioTemplateGrid({
  projectKey,
  templates,
  canEdit,
}: {
  projectKey: string;
  templates: StudioTemplate[];
  canEdit: boolean;
}) {
  const upload = useUploadStudioTemplatePhoto(projectKey);
  const update = useUpdateStudioTemplate(projectKey);
  const [editing, setEditing] = useState<StudioTemplate | null>(null);

  return (
    <>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-6">
        {templates.map((template) => (
          <StudioTemplateCard
            key={template.slot}
            template={template}
            canEdit={canEdit}
            uploading={upload.isPending && upload.variables?.slot === template.slot}
            onUpload={(file) => upload.mutate({ slot: template.slot, file })}
            onEdit={() => setEditing(template)}
          />
        ))}
      </div>
      <StudioTemplateDialog
        template={editing}
        saving={update.isPending}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
        onSubmit={(patch) => {
          if (!editing) return;
          update.mutate({ slot: editing.slot, patch }, { onSuccess: () => setEditing(null) });
        }}
      />
    </>
  );
}
