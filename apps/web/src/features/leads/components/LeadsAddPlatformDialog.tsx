import { useState } from 'react';
import Modal from '@/components/common/overlay/Modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import type { LeadFormat, LeadPlatformInput } from '@/lib/api';
import { slugify } from '../utils/leads';
import LeadsFormatSelect from './LeadsFormatSelect';

export default function LeadsAddPlatformDialog({
  saving,
  onSubmit,
  onClose,
}: {
  saving: boolean;
  onSubmit: (input: LeadPlatformInput) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugEdited, setSlugEdited] = useState(false);
  const [leadFormat, setLeadFormat] = useState<LeadFormat>('email');
  const [instructions, setInstructions] = useState('');
  const effectiveSlug = slugEdited ? slug : slugify(name);
  const valid = name.trim().length > 0 && /^[a-z0-9]+(-[a-z0-9]+)*$/.test(effectiveSlug);

  return (
    <Modal
      title="Add platform"
      description="The platform gets its own dashboard, leads, scrape logs and agent. The agent is added to the Agents tab."
      onClose={onClose}
    >
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (valid) onSubmit({ name: name.trim(), slug: effectiveSlug, leadFormat, instructions });
        }}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="platform-name">Name</Label>
            <Input
              id="platform-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Facebook"
              autoFocus
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="platform-slug">Slug</Label>
            <Input
              id="platform-slug"
              value={effectiveSlug}
              onChange={(event) => {
                setSlugEdited(true);
                setSlug(event.target.value);
              }}
              placeholder="facebook"
            />
          </div>
        </div>
        <LeadsFormatSelect id="platform-format" value={leadFormat} onChange={setLeadFormat} />
        <div className="space-y-2">
          <Label htmlFor="platform-instructions">Agent instructions</Label>
          <Textarea
            id="platform-instructions"
            value={instructions}
            onChange={(event) => setInstructions(event.target.value)}
            placeholder="How the agent finds businesses on this platform. Sent with every scrape job."
            rows={4}
          />
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" disabled={!valid || saving}>
            Add platform
          </Button>
        </div>
      </form>
    </Modal>
  );
}
