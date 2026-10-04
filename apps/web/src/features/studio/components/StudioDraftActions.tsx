'use client';

import { useState } from 'react';
import { CalendarClock, Check, Send, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import type { StudioDraftDetail } from '@/lib/api';
import { formatDateTime } from '@/utils/dates';
import type { useStudioDraftAction } from '../services/studio.service';
import { targetLabel } from '../utils/platforms';
import StudioScheduleDialog from './StudioScheduleDialog';

// The next step for the current version. Each request names that version, so
// the API refuses it when the draft changed in the meantime.
export default function StudioDraftActions({
  projectKey,
  draft,
  action,
}: {
  projectKey: string;
  draft: StudioDraftDetail;
  action: ReturnType<typeof useStudioDraftAction>;
}) {
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  const [scheduling, setScheduling] = useState(false);
  const version = draft.currentVersion;
  const run = (name: 'request-review' | 'review', body: object) =>
    action.mutate({ action: name, body: { version, ...body } });

  return (
    <div className="space-y-3 rounded-md border p-3">
      {draft.status === 'draft' && (
        <Button size="sm" onClick={() => run('request-review', {})} disabled={action.isPending}>
          <Send className="size-3.5" />
          Request review
        </Button>
      )}

      {draft.status === 'review_requested' && !rejecting && (
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            onClick={() => run('review', { decision: 'approved' })}
            disabled={action.isPending}
          >
            <Check className="size-3.5" />
            Approve version {version}
          </Button>
          <Button size="sm" variant="outline" onClick={() => setRejecting(true)}>
            <X className="size-3.5" />
            Reject
          </Button>
        </div>
      )}

      {draft.status === 'review_requested' && rejecting && (
        <div className="space-y-2">
          <Label htmlFor="studio-draft-reason">Reason</Label>
          <Textarea
            id="studio-draft-reason"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            maxLength={1000}
            placeholder="What has to change"
          />
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="destructive"
              disabled={!reason.trim() || action.isPending}
              onClick={() => run('review', { decision: 'rejected', reason: reason.trim() })}
            >
              Reject version {version}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setRejecting(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {draft.status === 'rejected' && (
        <p className="text-sm text-muted-foreground">
          Edit the caption and save a new version to send it for review again.
        </p>
      )}

      {draft.status === 'approved' && (
        <Button size="sm" onClick={() => setScheduling(true)}>
          <CalendarClock className="size-3.5" />
          Schedule
        </Button>
      )}

      {draft.status === 'scheduled' && draft.schedule && (
        <p className="text-sm">
          Version {draft.schedule.version} goes out {formatDateTime(draft.schedule.scheduledFor)} (
          {draft.schedule.timezone})
          {draft.schedule.targets.length > 0 &&
            ` to ${draft.schedule.targets.map(targetLabel).join(', ')}`}
          .
        </p>
      )}

      <StudioScheduleDialog
        projectKey={projectKey}
        draft={scheduling ? draft : null}
        onClose={() => setScheduling(false)}
      />
    </div>
  );
}
