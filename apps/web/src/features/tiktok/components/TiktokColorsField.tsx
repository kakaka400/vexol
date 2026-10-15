'use client';

import { Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { MAX_COLORS } from '../utils/tiktok';

// The color palette of an animation, as hex colors.
export default function TiktokColorsField({
  value,
  onChange,
}: {
  value: string[];
  onChange: (next: string[]) => void;
}) {
  const set = (index: number, color: string) =>
    onChange(value.map((current, i) => (i === index ? color : current)));
  return (
    <div className="space-y-1.5">
      <Label>Colors</Label>
      <div className="flex flex-wrap items-center gap-2">
        {value.map((color, index) => (
          <div key={index} className="flex items-center gap-1 rounded-md border py-1 pr-1 pl-1.5">
            <input
              type="color"
              value={color}
              onChange={(event) => set(index, event.target.value)}
              aria-label={`Color ${index + 1}`}
              className="size-6 cursor-pointer rounded border-0 bg-transparent p-0"
            />
            <span className="font-mono text-xs">{color}</span>
            <Button
              size="icon"
              variant="ghost"
              className="size-6"
              aria-label={`Remove ${color}`}
              onClick={() => onChange(value.filter((_, i) => i !== index))}
            >
              <X className="size-3" />
            </Button>
          </div>
        ))}
        {value.length < MAX_COLORS && (
          <Button size="sm" variant="outline" onClick={() => onChange([...value, '#000000'])}>
            <Plus className="size-3.5" /> Add color
          </Button>
        )}
      </div>
    </div>
  );
}
