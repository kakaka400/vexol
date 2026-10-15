'use client';

import { Pencil, Trash2 } from 'lucide-react';
import type { TiktokTemplate } from '@/lib/api';
import { Button } from '@/components/ui/button';
import TiktokColorSwatches from '../TiktokColorSwatches';

export default function TiktokTemplateCard({
  template,
  onEdit,
  onDelete,
}: {
  template: TiktokTemplate;
  onEdit: (() => void) | null;
  onDelete: (() => void) | null;
}) {
  return (
    <li className="space-y-2 rounded-lg border p-4 text-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="truncate font-medium">{template.name}</h3>
          <p className="text-xs text-muted-foreground">
            {template.durationSeconds}s{template.style && ` · ${template.style}`}
          </p>
        </div>
        <div className="flex shrink-0 gap-1">
          {onEdit && (
            <Button size="icon" variant="ghost" aria-label="Edit template" onClick={onEdit}>
              <Pencil className="size-3.5" />
            </Button>
          )}
          {onDelete && (
            <Button size="icon" variant="ghost" aria-label="Delete template" onClick={onDelete}>
              <Trash2 className="size-3.5" />
            </Button>
          )}
        </div>
      </div>
      <p className="line-clamp-4 whitespace-pre-wrap text-muted-foreground">{template.prompt}</p>
      <TiktokColorSwatches colors={template.colors} />
    </li>
  );
}
