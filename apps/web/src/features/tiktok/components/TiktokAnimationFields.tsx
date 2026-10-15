'use client';

import type { TiktokAnimation } from '@/lib/api';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import TiktokColorsField from './TiktokColorsField';

// What the animation shows and how it looks: shared by templates and drafts.
export default function TiktokAnimationFields({
  value,
  onChange,
}: {
  value: TiktokAnimation;
  onChange: (next: TiktokAnimation) => void;
}) {
  const set = (patch: Partial<TiktokAnimation>) => onChange({ ...value, ...patch });
  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="tiktok-prompt">Prompt</Label>
        <Textarea
          id="tiktok-prompt"
          value={value.prompt}
          onChange={(event) => set({ prompt: event.target.value })}
          rows={6}
          placeholder="What happens in the animation, scene by scene"
        />
      </div>
      <TiktokColorsField value={value.colors} onChange={(colors) => set({ colors })} />
      <div className="grid gap-4 sm:grid-cols-[1fr_8rem]">
        <div className="space-y-1.5">
          <Label htmlFor="tiktok-style">Style</Label>
          <Input
            id="tiktok-style"
            value={value.style}
            onChange={(event) => set({ style: event.target.value })}
            placeholder="e.g. flat 2D, neon, clay"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="tiktok-duration">Duration (s)</Label>
          <Input
            id="tiktok-duration"
            type="number"
            min={1}
            max={600}
            value={value.durationSeconds}
            onChange={(event) => set({ durationSeconds: Number(event.target.value) })}
          />
        </div>
      </div>
    </div>
  );
}
