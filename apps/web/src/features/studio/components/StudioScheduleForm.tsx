'use client';

import { useState } from 'react';
import { CalendarClock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import type { StudioDraft, StudioPublishFormat, StudioPublishTarget } from '@/lib/api';
import { useScheduleStudioDraft, useStudioPublishAccountsQuery } from '../services/studio.service';
import { SCHEDULE_TIME_ZONE } from '../utils/platforms';
import StudioScheduleAccountRow from './StudioScheduleAccountRow';

export type StudioScheduleDraft = Pick<
  StudioDraft,
  'id' | 'status' | 'currentVersion' | 'caption' | 'imageUrl'
>;

export default function StudioScheduleForm({
  projectKey,
  draft,
  onDone,
}: {
  projectKey: string;
  draft: StudioScheduleDraft;
  onDone: () => void;
}) {
  const accountsQuery = useStudioPublishAccountsQuery(projectKey, true);
  const schedule = useScheduleStudioDraft(projectKey);
  const [when, setWhen] = useState('');
  // The chosen accounts, each with the format it is posted in.
  const [chosen, setChosen] = useState<Record<string, StudioPublishFormat>>({});
  const accounts = accountsQuery.data ?? [];
  const targets: StudioPublishTarget[] = accounts
    .filter((account) => chosen[account.id])
    .map((account) => ({
      accountId: account.id,
      platform: account.platform,
      format: chosen[account.id]!,
    }));
  const inFuture = when !== '' && new Date(when).getTime() > Date.now();

  const choose = (accountId: string, format: StudioPublishFormat | null) =>
    setChosen(({ [accountId]: _previous, ...rest }) =>
      format ? { ...rest, [accountId]: format } : rest,
    );

  return (
    <div className="space-y-5">
      <div className="flex gap-3 rounded-md border p-3">
        {draft.imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element -- a public API image URL
          <img
            src={draft.imageUrl}
            alt=""
            className="size-20 shrink-0 rounded border bg-muted/40 object-cover"
          />
        )}
        <p className="line-clamp-4 text-sm">{draft.caption}</p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="studio-schedule-when">Date and time</Label>
        <Input
          id="studio-schedule-when"
          type="datetime-local"
          value={when}
          onChange={(event) => setWhen(event.target.value)}
        />
      </div>

      <div className="space-y-2">
        <Label>Post to</Label>
        {accountsQuery.isLoading ? (
          <Skeleton className="h-24" />
        ) : accountsQuery.isError ? (
          <p className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
            {accountsQuery.error.message}
          </p>
        ) : accounts.length === 0 ? (
          <p className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
            No social accounts are connected in Zernio yet.
          </p>
        ) : (
          <ul className="divide-y rounded-md border">
            {accounts.map((account) => (
              <StudioScheduleAccountRow
                key={account.id}
                account={account}
                hasImage={draft.imageUrl != null}
                format={chosen[account.id] ?? null}
                onChange={(format) => choose(account.id, format)}
              />
            ))}
          </ul>
        )}
      </div>

      {draft.status !== 'approved' && (
        <p className="text-xs text-muted-foreground">
          Scheduling approves version {draft.currentVersion} in your name.
        </p>
      )}
      {schedule.isError && <p className="text-sm text-destructive">{schedule.error.message}</p>}

      <DialogFooter>
        <Button variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button
          disabled={!inFuture || targets.length === 0 || schedule.isPending}
          onClick={() =>
            schedule.mutate(
              {
                draft,
                scheduledFor: new Date(when).toISOString(),
                timezone: SCHEDULE_TIME_ZONE,
                targets,
              },
              { onSuccess: onDone },
            )
          }
        >
          <CalendarClock className="size-3.5" />
          {schedule.isPending ? 'Scheduling…' : 'Schedule'}
        </Button>
      </DialogFooter>
    </div>
  );
}
