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
import { useLinkedinChannelsQuery } from '../services/linkedin.service';

export interface LinkedinTarget {
  channelId: string;
  mode: 'now' | 'schedule';
  // A datetime-local value, in the browser's time zone.
  when: string;
}

const TIME_ZONE = Intl.DateTimeFormat().resolvedOptions().timeZone;

export default function LinkedinTargetFields({
  projectKey,
  value,
  onChange,
}: {
  projectKey: string;
  value: LinkedinTarget;
  onChange: (next: LinkedinTarget) => void;
}) {
  const channels = useLinkedinChannelsQuery(projectKey);
  const set = (patch: Partial<LinkedinTarget>) => onChange({ ...value, ...patch });

  if (channels.isLoading) return <Skeleton className="h-24" />;
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
        <Label>LinkedIn account in Buffer</Label>
        {accounts.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No LinkedIn profile or page is connected in Buffer. Connect one in Buffer, then reload
            this page.
          </p>
        ) : (
          <Select value={value.channelId} onValueChange={(channelId) => set({ channelId })}>
            <SelectTrigger className="w-full" aria-label="LinkedIn account">
              <SelectValue placeholder="Choose an account" />
            </SelectTrigger>
            <SelectContent>
              {accounts.map((account) => (
                <SelectItem key={account.id} value={account.id} disabled={!account.connected}>
                  {account.displayName || account.username}
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
          onValueChange={(mode) => set({ mode: mode as LinkedinTarget['mode'] })}
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
      {value.mode === 'schedule' && (
        <div className="space-y-1.5">
          <Label htmlFor="linkedin-when">Date and time ({TIME_ZONE})</Label>
          <Input
            id="linkedin-when"
            type="datetime-local"
            value={value.when}
            onChange={(event) => set({ when: event.target.value })}
          />
        </div>
      )}
    </div>
  );
}
