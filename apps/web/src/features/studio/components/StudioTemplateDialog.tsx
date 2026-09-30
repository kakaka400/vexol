'use client';

import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import type { StudioTemplate, StudioTemplatePatch } from '@/lib/api';

// The agent reads the description to decide which template fits a request, so it
// says what the template is for rather than what it looks like.
export default function StudioTemplateDialog({
  template,
  saving,
  onOpenChange,
  onSubmit,
}: {
  template: StudioTemplate | null;
  saving: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (patch: StudioTemplatePatch) => void;
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  useEffect(() => {
    if (!template) return;
    setName(template.name);
    setDescription(template.description);
  }, [template]);

  return (
    <Dialog open={template != null} onOpenChange={onOpenChange}>
      <DialogContent>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            onSubmit({ name: name.trim(), description: description.trim() });
          }}
        >
          <DialogHeader>
            <DialogTitle>Template {template?.slot}</DialogTitle>
            <DialogDescription>
              Describe what this template is for. The agent uses it to pick the right one.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-5">
            <div className="space-y-1.5">
              <Label htmlFor="studio-template-name">Name</Label>
              <Input
                id="studio-template-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                maxLength={80}
                placeholder="Quote card"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="studio-template-description">Description</Label>
              <Textarea
                id="studio-template-description"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                maxLength={500}
                className="min-h-24"
                placeholder="A short quote in large white type on a dark background. Use for tips and statements."
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
