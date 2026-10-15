'use client';

import { useState } from 'react';
import { Plus } from 'lucide-react';
import type { TiktokTemplate } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useDeleteTiktokTemplate, useTiktokTemplatesQuery } from '../../services/tiktok.service';
import TiktokTemplateCard from './TiktokTemplateCard';
import TiktokTemplateDialog from './TiktokTemplateDialog';

// The prompt library: reusable prompts with their colors, style and duration.
export default function TiktokLibraryTab({
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
  const templates = useTiktokTemplatesQuery(projectKey);
  const remove = useDeleteTiktokTemplate(projectKey);
  const [dialog, setDialog] = useState<{ template: TiktokTemplate | null } | null>(null);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          Prompts the TikTok agent can render. Name one in the agent chat, or start a draft from it.
        </p>
        {canCreate && (
          <Button size="sm" onClick={() => setDialog({ template: null })}>
            <Plus className="size-3.5" /> New template
          </Button>
        )}
      </div>
      {templates.isLoading ? (
        <Skeleton className="h-40" />
      ) : templates.isError ? (
        <p className="text-sm text-destructive">{templates.error.message}</p>
      ) : templates.data!.length === 0 ? (
        <p className="text-sm text-muted-foreground">The library is empty.</p>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {templates.data!.map((template) => (
            <TiktokTemplateCard
              key={template.id}
              template={template}
              onEdit={canEdit ? () => setDialog({ template }) : null}
              onDelete={canDelete ? () => remove.mutate(template.id) : null}
            />
          ))}
        </ul>
      )}
      <TiktokTemplateDialog
        projectKey={projectKey}
        open={dialog != null}
        template={dialog?.template ?? null}
        onClose={() => setDialog(null)}
      />
    </div>
  );
}
