import { useState } from 'react';
import ConfirmDialog from '@/components/common/overlay/ConfirmDialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import type { ScrapeRun } from '@/lib/api';
import { useDeleteScrapeRun } from '../services/leads.service';
import { formatLeadDate } from '../utils/leads';

export default function LeadsRunDeleteDialog({
  projectKey,
  run,
  leadCount,
  onClose,
}: {
  projectKey: string;
  run: ScrapeRun;
  leadCount: number;
  onClose: () => void;
}) {
  const [deleteLeads, setDeleteLeads] = useState(false);
  const deleteRun = useDeleteScrapeRun(projectKey);

  return (
    <ConfirmDialog
      title="Delete scrape log"
      confirmLabel={deleteLeads ? 'Delete log and leads' : 'Delete log'}
      onClose={onClose}
      onConfirm={async () => {
        await deleteRun.mutateAsync({ runId: run.id, deleteLeads });
        onClose();
      }}
    >
      <p className="text-sm text-muted-foreground">
        The {run.platformName} scrape of {formatLeadDate(run.createdAt)} ({run.niche}, {run.region})
        is removed from the logs.
      </p>
      {leadCount > 0 ? (
        <div className="flex items-start gap-2 rounded-md border p-3">
          <Checkbox
            id="delete-run-leads"
            checked={deleteLeads}
            onCheckedChange={(checked) => setDeleteLeads(checked === true)}
          />
          <Label htmlFor="delete-run-leads" className="leading-snug font-normal">
            Also delete the {leadCount} lead(s) from this scrape. Without this, the leads stay in
            the leads overview.
          </Label>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">This scrape has no leads.</p>
      )}
    </ConfirmDialog>
  );
}
