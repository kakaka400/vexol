'use client';

import { useState } from 'react';
import { CalendarClock, Check, Send, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import type { StudioDraftDetail } from '@/lib/api';
import { formatDateTime } from '@/utils/dates';
import type { useStudioDraftAction } from '../services/studio.service';

// The schedule is entered in the browser's own time zone, which is stored with it.
const TIME_ZONE = Intl.DateTimeFormat().resolvedOptions().timeZone;

// The next step for the current version. Each request names that version, so
// the API refuses it when the draft changed in the meantime.
export default function StudioDraftActions({
  draft,
  action,
}: {
  draft: StudioDraftDetail;
  action: ReturnType<typeof useStudioDraftAction>;
}) {
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  const [when, setWhen] = useState('');
  const version = draft.currentVersion;
  const run = (name: 'request-review' | 'review' | 'schedule', body: object) =>
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
        <div className="space-y-2">
          <Label htmlFor="studio-draft-when">Schedule ({TIME_ZONE})</Label>
          <div className="flex flex-wrap gap-2">
            <Input
              id="studio-draft-when"
              type="datetime-local"
              value={when}
              onChange={(event) => setWhen(event.target.value)}
              className="w-auto"
            />
            <Button
              size="sm"
              disabled={!when || action.isPending}
              onClick={() =>
                run('schedule', {
                  scheduledFor: new Date(when).toISOString(),
                  timezone: TIME_ZONE,
                })
              }
            >
              <CalendarClock className="size-3.5" />
              Schedule
            </Button>
          </div>
        </div>
      )}

      {draft.status === 'scheduled' && draft.schedule && (
        <p className="text-sm">
          Version {draft.schedule.version} is scheduled for{' '}
          {formatDateTime(draft.schedule.scheduledFor)} ({draft.schedule.timezone}).
        </p>
      )}

      {(draft.status === 'approved' || draft.status === 'scheduled') && (
        <p className="text-xs text-muted-foreground">
          Publishing is not connected yet. A scheduled post is not published.
        </p>
      )}
    </div>
  );
}
