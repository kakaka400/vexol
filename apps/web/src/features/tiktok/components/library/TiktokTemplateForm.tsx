'use client';

import { useState } from 'react';
import type { TiktokTemplate } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useSaveTiktokTemplate } from '../../services/tiktok.service';
import { EMPTY_ANIMATION } from '../../utils/tiktok';
import TiktokAnimationFields from '../TiktokAnimationFields';

export default function TiktokTemplateForm({
  projectKey,
  template,
  onDone,
}: {
  projectKey: string;
  template: TiktokTemplate | null;
  onDone: () => void;
}) {
  const [name, setName] = useState(template?.name ?? '');
  const [animation, setAnimation] = useState(
    template
      ? {
          prompt: template.prompt,
          colors: template.colors,
          style: template.style,
          durationSeconds: template.durationSeconds,
        }
      : EMPTY_ANIMATION,
  );
  const save = useSaveTiktokTemplate(projectKey);
  const ready = name.trim() !== '' && animation.prompt.trim() !== '';

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="tiktok-template-name">Name</Label>
        <Input
          id="tiktok-template-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
      </div>
      <TiktokAnimationFields value={animation} onChange={setAnimation} />
      {save.isError && <p className="text-sm text-destructive">{save.error.message}</p>}
      <DialogFooter>
        <Button variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button
          disabled={!ready || save.isPending}
          onClick={() =>
            save.mutate(
              { id: template?.id ?? null, values: { name: name.trim(), ...animation } },
              { onSuccess: onDone },
            )
          }
        >
          {save.isPending ? 'Saving…' : 'Save'}
        </Button>
      </DialogFooter>
    </div>
  );
}
