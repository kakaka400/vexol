'use client';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { useTwitter } from '../../context/TwitterContext';
import { useTwitterChannelsQuery } from '../../services/twitter.service';

export interface PublishTarget {
  accountId: string;
  mode: 'now' | 'schedule';
  when: string;
  timezone: string;
}

// Where and when: the X channel connected in Buffer, publish now or at a time in
// a chosen time zone.
export default function TwitterPublishTarget({
  value,
  onChange,
}: {
  value: PublishTarget;
  onChange: (next: PublishTarget) => void;
}) {
  const { projectKey } = useTwitter();
  const channels = useTwitterChannelsQuery(projectKey);
  const set = (patch: Partial<PublishTarget>) => onChange({ ...value, ...patch });

  if (channels.isLoading) return <Skeleton className="h-32" />;
  if (channels.isError || !channels.data?.configured) {
    return (
      <p className="rounded-md bg-muted/50 p-3 text-sm text-muted-foreground">
        {channels.data?.error ?? channels.error?.message ?? 'Buffer is not configured.'}
      </p>
    );
  }
  const accounts = channels.data.channels;
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="space-y-1.5 sm:col-span-2">
        <Label>X account in Buffer</Label>
        {accounts.length === 0 ? (
          <p className="text-sm text-muted-foreground">No X account is connected in Buffer.</p>
        ) : (
          <Select value={value.accountId} onValueChange={(accountId) => set({ accountId })}>
            <SelectTrigger className="w-full" aria-label="X account">
              <SelectValue placeholder="Choose an account" />
            </SelectTrigger>
            <SelectContent>
              {accounts.map((account) => (
                <SelectItem key={account.id} value={account.id} disabled={!account.connected}>
                  @{account.username || account.displayName}
                  {!account.connected && ' (reconnect in Buffer)'}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>
      <div className="space-y-1.5">
        <Label>When</Label>
        <Select
          value={value.mode}
          onValueChange={(mode) => set({ mode: mode as PublishTarget['mode'] })}
        >
          <SelectTrigger className="w-full" aria-label="When">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="schedule">At a date and time</SelectItem>
            <SelectItem value="now">Publish now</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="twitter-timezone">Time zone</Label>
        <Input
          id="twitter-timezone"
          value={value.timezone}
          onChange={(e) => set({ timezone: e.target.value })}
        />
      </div>
      {value.mode === 'schedule' && (
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="twitter-when">Date and time</Label>
          <Input
            id="twitter-when"
            type="datetime-local"
            value={value.when}
            onChange={(e) => set({ when: e.target.value })}
          />
        </div>
      )}
    </div>
  );
}
