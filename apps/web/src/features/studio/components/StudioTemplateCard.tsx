'use client';

import { useRef } from 'react';
import { ImagePlus, Pencil, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { StudioTemplate } from '@/lib/api';
import { useStudioPhoto } from '../hooks/useStudioPhoto';

export default function StudioTemplateCard({
  template,
  canEdit,
  uploading,
  onUpload,
  onEdit,
}: {
  template: StudioTemplate;
  canEdit: boolean;
  uploading: boolean;
  onUpload: (file: File) => void;
  onEdit: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const photoUrl = useStudioPhoto(template.photoId);
  const pick = () => inputRef.current?.click();

  return (
    <div className="overflow-hidden rounded-lg border bg-card">
      <div className="relative aspect-[4/5] bg-muted/40">
        {template.photoId ? (
          photoUrl && (
            // eslint-disable-next-line @next/next/no-img-element -- a blob URL of a vault file
            <img
              src={photoUrl}
              alt={template.name || `Template ${template.slot}`}
              className="size-full object-contain"
            />
          )
        ) : (
          <button
            type="button"
            onClick={pick}
            disabled={!canEdit || uploading}
            className="flex size-full flex-col items-center justify-center gap-2 text-sm text-muted-foreground transition-colors hover:bg-muted/60 disabled:pointer-events-none"
          >
            <ImagePlus className="size-6" />
            {uploading ? 'Uploading…' : 'Upload photo'}
          </button>
        )}
        <span className="absolute top-2 left-2 rounded-md bg-background/90 px-1.5 py-0.5 text-xs font-medium">
          {template.slot}
        </span>
      </div>

      <div className="space-y-2 p-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">
            {template.name || `Template ${template.slot}`}
          </p>
          <p className="line-clamp-2 min-h-8 text-xs text-muted-foreground">
            {template.description || 'No description yet'}
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={pick}
            disabled={!canEdit || uploading}
            className="flex-1"
          >
            <Upload className="size-3.5" />
            {template.photoId ? 'Replace' : 'Upload'}
          </Button>
          <Button size="sm" variant="ghost" onClick={onEdit} disabled={!canEdit}>
            <Pencil className="size-3.5" />
            <span className="sr-only">Edit template {template.slot}</span>
          </Button>
        </div>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (file) onUpload(file);
        }}
      />
    </div>
  );
}
