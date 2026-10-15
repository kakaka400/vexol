'use client';

import type { TiktokTemplate } from '@/lib/api';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useTiktokTemplatesQuery } from '../../services/tiktok.service';

// Picks a library template; its prompt, colors, style and duration fill the draft.
export default function TiktokTemplatePicker({
  projectKey,
  value,
  onPick,
}: {
  projectKey: string;
  value: string | undefined;
  onPick: (template: TiktokTemplate) => void;
}) {
  const templates = useTiktokTemplatesQuery(projectKey).data ?? [];
  if (templates.length === 0) return null;
  return (
    <div className="space-y-1.5">
      <Label>Start from a template (optional)</Label>
      <Select
        value={value ?? ''}
        onValueChange={(id) => {
          const template = templates.find((candidate) => candidate.id === id);
          if (template) onPick(template);
        }}
      >
        <SelectTrigger className="w-full" aria-label="Template">
          <SelectValue placeholder="Choose a template" />
        </SelectTrigger>
        <SelectContent>
          {templates.map((template) => (
            <SelectItem key={template.id} value={template.id}>
              {template.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
