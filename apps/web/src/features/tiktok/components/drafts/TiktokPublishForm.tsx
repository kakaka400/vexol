'use client';

import { useState } from 'react';
import { Send } from 'lucide-react';
import type { TiktokDraft } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { DialogFooter } from '@/components/ui/dialog';
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
import { usePublishTiktokDraft, useTiktokChannelsQuery } from '../../services/tiktok.service';

const TIME_ZONE = Intl.DateTimeFormat().resolvedOptions().timeZone;

// Nothing goes to Buffer until the person ticks the confirmation.
export default function TiktokPublishForm({
  projectKey,
  draft,
  onDone,
}: {
  projectKey: string;
  draft: TiktokDraft;
  onDone: () => void;
}) {
  const channels = useTiktokChannelsQuery(projectKey);
  const publish = usePublishTiktokDraft(projectKey, draft.id);
  const [channelId, setChannelId] = useState('');
  const [mode, setMode] = useState<'now' | 'schedule'>('schedule');
  const [when, setWhen] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const ready = channelId !== '' && (mode === 'now' || when !== '');

  if (channels.isLoading) return <Skeleton className="h-32" />;
  if (channels.isError || !channels.data?.configured) {
    return (
      <p className="rounded-md bg-muted/50 p-3 text-sm text-muted-foreground">
        {channels.data?.error ?? channels.error?.message ?? 'Buffer is not configured.'}
      </p>
    );
  }
  const accounts = channels.data.channels;
  if (accounts.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No TikTok account is connected in Buffer. Connect one in Buffer, then reload this page.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label>TikTok account in Buffer</Label>
        <Select
          value={channelId}
          onValueChange={(value) => {
            setChannelId(value);
            setConfirmed(false);
          }}
        >
          <SelectTrigger className="w-full" aria-label="TikTok account">
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
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>When</Label>
          <Select
            value={mode}
            onValueChange={(value) => {
              setMode(value as 'now' | 'schedule');
              setConfirmed(false);
            }}
          >
            <SelectTrigger className="w-full" aria-label="When">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="schedule">At a date and time</SelectItem>
              <SelectItem value="now">Post now</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {mode === 'schedule' && (
          <div className="space-y-1.5">
            <Label htmlFor="tiktok-when">Date and time ({TIME_ZONE})</Label>
            <Input
              id="tiktok-when"
              type="datetime-local"
              value={when}
              onChange={(event) => {
                setWhen(event.target.value);
                setConfirmed(false);
              }}
            />
          </div>
        )}
      </div>
      {ready && (
        <label className="flex items-start gap-2 text-sm">
          <Checkbox
            checked={confirmed}
            onCheckedChange={(value) => setConfirmed(value === true)}
            className="mt-0.5"
          />
          <span>
            I checked the video and caption and confirm they go to TikTok{' '}
            {mode === 'now' ? 'now' : `on ${when.replace('T', ' ')}`}.
          </span>
        </label>
      )}
      {publish.isError && <p className="text-sm text-destructive">{publish.error.message}</p>}
      <DialogFooter>
        <Button variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button
          disabled={!ready || !confirmed || publish.isPending}
          onClick={() =>
            publish.mutate(
              {
                channelId,
                mode,
                scheduledFor: mode === 'schedule' ? new Date(when).toISOString() : undefined,
                idempotencyKey: crypto.randomUUID(),
              },
              { onSuccess: onDone },
            )
          }
        >
          <Send className="size-3.5" />
          {publish.isPending ? 'Sending…' : mode === 'now' ? 'Post now' : 'Schedule'}
        </Button>
      </DialogFooter>
    </div>
  );
}
