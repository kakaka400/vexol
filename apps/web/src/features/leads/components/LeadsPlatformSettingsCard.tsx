import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import ConfirmDialog from '@/components/common/overlay/ConfirmDialog';
import EnabledSwitch from '@/components/common/inputs/EnabledSwitch';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { usePermissions } from '@/hooks/usePermissions';
import type { LeadPlatform } from '@/lib/api';
import { useDeleteLeadPlatform, useUpdateLeadPlatform } from '../services/leads.service';
import LeadsFormatSelect from './LeadsFormatSelect';

export default function LeadsPlatformSettingsCard({
  projectKey,
  platform,
  onDeleted,
}: {
  projectKey: string;
  platform: LeadPlatform;
  onDeleted: () => void;
}) {
  const { can } = usePermissions();
  const update = useUpdateLeadPlatform(projectKey);
  const remove = useDeleteLeadPlatform(projectKey);
  const [name, setName] = useState(platform.name);
  const [instructions, setInstructions] = useState(platform.instructions);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const canEdit = can('leads', 'edit');
  const dirty = name.trim() !== platform.name || instructions !== platform.instructions;

  return (
    <Card className="shadow-none">
      <CardHeader>
        <CardTitle>Platform</CardTitle>
        <CardDescription>Sent to the agent with every scrape job.</CardDescription>
        <CardAction>
          <EnabledSwitch
            checked={platform.active}
            disabled={!canEdit || update.isPending}
            onChange={(active) => update.mutate({ platformId: platform.id, patch: { active } })}
          />
        </CardAction>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="platform-settings-name">Name</Label>
          <Input
            id="platform-settings-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            disabled={!canEdit}
            maxLength={80}
          />
        </div>
        <LeadsFormatSelect
          id="platform-settings-format"
          value={platform.leadFormat}
          disabled={!canEdit || update.isPending}
          onChange={(leadFormat) =>
            update.mutate({ platformId: platform.id, patch: { leadFormat } })
          }
        />
        <div className="space-y-2">
          <Label htmlFor="platform-settings-instructions">Agent instructions</Label>
          <Textarea
            id="platform-settings-instructions"
            value={instructions}
            onChange={(event) => setInstructions(event.target.value)}
            disabled={!canEdit}
            rows={4}
            maxLength={4000}
            placeholder="How the agent finds businesses on this platform."
          />
        </div>
        <div className="flex flex-wrap justify-between gap-2">
          {can('ai_agents', 'delete') ? (
            <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(true)}>
              <Trash2 />
              Delete platform
            </Button>
          ) : (
            <span />
          )}
          {canEdit && (
            <Button
              size="sm"
              disabled={!dirty || name.trim().length === 0 || update.isPending}
              onClick={() =>
                update.mutate({
                  platformId: platform.id,
                  patch: { name: name.trim(), instructions },
                })
              }
            >
              Save
            </Button>
          )}
        </div>
      </CardContent>
      {confirmDelete && (
        <ConfirmDialog
          title={`Delete ${platform.name}`}
          confirmLabel="Delete platform"
          onClose={() => setConfirmDelete(false)}
          onConfirm={async () => {
            await remove.mutateAsync(platform.id);
            onDeleted();
          }}
        >
          <p className="text-sm text-muted-foreground">
            This deletes the platform with its {platform.leadCount} lead(s), {platform.runCount}{' '}
            scrape log(s) and its agent {platform.agent ? `(${platform.agent.name})` : ''} in the
            Agents tab. Export the data first if you want to keep it.
          </p>
        </ConfirmDialog>
      )}
    </Card>
  );
}
