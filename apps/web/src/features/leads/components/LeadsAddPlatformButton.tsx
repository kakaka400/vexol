import { useState } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { LeadPlatformWithKey } from '@/lib/api';
import { useCreateLeadPlatform } from '../services/leads.service';
import LeadsAddPlatformDialog from './LeadsAddPlatformDialog';
import LeadsApiKeyDialog from './LeadsApiKeyDialog';

export default function LeadsAddPlatformButton({
  projectKey,
  onCreated,
}: {
  projectKey: string;
  onCreated: (slug: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [created, setCreated] = useState<LeadPlatformWithKey | null>(null);
  const create = useCreateLeadPlatform(projectKey);

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <Plus />
        Add platform
      </Button>
      {open && (
        <LeadsAddPlatformDialog
          saving={create.isPending}
          onClose={() => setOpen(false)}
          onSubmit={(input) =>
            create.mutate(input, {
              onSuccess: (result) => {
                setOpen(false);
                setCreated(result);
                onCreated(result.platform.slug);
              },
            })
          }
        />
      )}
      {created && (
        <LeadsApiKeyDialog
          projectKey={projectKey}
          platform={created.platform}
          apiKey={created.apiKey}
          onClose={() => setCreated(null)}
        />
      )}
    </>
  );
}
