'use client';

import { useState } from 'react';
import { Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { DialogFooter } from '@/components/ui/dialog';
import type { TwitterDraft } from '@/lib/api';
import { useTwitter } from '../../context/TwitterContext';
import {
  usePublishTwitterDraft,
  useTwitterSettingsQuery,
  useValidateTwitterDraft,
} from '../../services/twitter.service';
import { SCHEDULE_TIME_ZONE, zonedTimeToUtc } from '../../utils/twitter';
import TwitterPreviewBody from './TwitterPreviewBody';
import TwitterPublishTarget, { type PublishTarget } from './TwitterPublishTarget';

// Validate, then confirm. The confirmation names the exact version the server
// checked (its content hash); changing any choice asks for a new check.
export default function TwitterPublishForm({
  draft,
  onDone,
}: {
  draft: TwitterDraft;
  onDone: () => void;
}) {
  const { projectKey } = useTwitter();
  const settings = useTwitterSettingsQuery(projectKey).data;
  const [target, setTarget] = useState<PublishTarget>({
    accountId: settings?.bufferChannelId ?? '',
    mode: 'schedule',
    when: '',
    timezone: settings?.defaultTimezone ?? SCHEDULE_TIME_ZONE,
  });
  const [confirmed, setConfirmed] = useState(false);
  const validate = useValidateTwitterDraft(projectKey, draft.id);
  const publish = usePublishTwitterDraft(projectKey, draft.id);
  const scheduledFor =
    target.mode === 'schedule' && target.when
      ? zonedTimeToUtc(target.when, target.timezone).toISOString()
      : undefined;
  const checked = validate.data;

  const change = (next: PublishTarget) => {
    setTarget(next);
    setConfirmed(false);
    validate.reset();
  };

  return (
    <div className="space-y-5">
      <TwitterPublishTarget value={target} onChange={change} />
      <Button
        variant="outline"
        disabled={
          !target.accountId || (target.mode === 'schedule' && !target.when) || validate.isPending
        }
        onClick={() =>
          validate.mutate({
            accountId: target.accountId,
            mode: target.mode,
            scheduledFor,
            timezone: target.timezone,
          })
        }
      >
        {validate.isPending ? 'Checking…' : 'Check and preview'}
      </Button>
      {validate.isError && <p className="text-sm text-destructive">{validate.error.message}</p>}
      {checked && <TwitterPreviewBody preview={checked} />}
      {checked?.ok && (
        <label className="flex items-start gap-2 text-sm">
          <Checkbox
            checked={confirmed}
            onCheckedChange={(value) => setConfirmed(value === true)}
            className="mt-0.5"
          />
          <span>
            I checked this preview and confirm that version {checked.version} goes to @
            {checked.account?.username}{' '}
            {target.mode === 'now'
              ? 'now'
              : `on ${target.when.replace('T', ' ')} (${target.timezone})`}
            .
          </span>
        </label>
      )}
      {publish.isError && <p className="text-sm text-destructive">{publish.error.message}</p>}
      <DialogFooter>
        <Button variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button
          disabled={!checked?.ok || !confirmed || publish.isPending}
          onClick={() =>
            publish.mutate(
              {
                mode: target.mode,
                body: {
                  version: checked!.version,
                  contentHash: checked!.contentHash,
                  accountId: target.accountId,
                  timezone: target.timezone,
                  scheduledFor,
                  confirm: true,
                },
              },
              { onSuccess: onDone },
            )
          }
        >
          <Send className="size-3.5" />
          {publish.isPending ? 'Sending…' : target.mode === 'now' ? 'Publish now' : 'Schedule'}
        </Button>
      </DialogFooter>
    </div>
  );
}
