'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import type { TwitterSettings } from '@/lib/api';
import { useTwitter } from '../../context/TwitterContext';
import { useTwitterChannelsQuery, useUpdateTwitterSettings } from '../../services/twitter.service';

const NONE = 'none';

export default function TwitterSettingsFields({
  initial,
  disabled,
}: {
  initial: TwitterSettings;
  disabled: boolean;
}) {
  const { projectKey } = useTwitter();
  const [values, setValues] = useState(initial);
  const channels = useTwitterChannelsQuery(projectKey).data?.channels ?? [];
  const save = useUpdateTwitterSettings(projectKey);
  const set = <K extends keyof TwitterSettings>(key: K, value: TwitterSettings[K]) =>
    setValues((current) => ({ ...current, [key]: value }));

  return (
    <section className="space-y-4">
      <h2 className="text-sm font-medium">Settings</h2>
      <div className="space-y-1.5">
        <Label>Default X account</Label>
        <Select
          value={values.zernioAccountId ?? NONE}
          disabled={disabled}
          onValueChange={(v) => set('zernioAccountId', v === NONE ? null : v)}
        >
          <SelectTrigger className="w-full" aria-label="Default X account">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>None</SelectItem>
            {channels.map((channel) => (
              <SelectItem key={channel.id} value={channel.id}>
                @{channel.username || channel.displayName}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="tw-lang">Default language</Label>
          <Input
            id="tw-lang"
            maxLength={3}
            disabled={disabled}
            value={values.defaultLanguage}
            onChange={(e) => set('defaultLanguage', e.target.value.toLowerCase())}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="tw-tz">Default time zone</Label>
          <Input
            id="tw-tz"
            disabled={disabled}
            value={values.defaultTimezone}
            onChange={(e) => set('defaultTimezone', e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="tw-max">Max results per run</Label>
          <Input
            id="tw-max"
            type="number"
            min={1}
            max={100}
            disabled={disabled}
            value={values.maxResults}
            onChange={(e) => set('maxResults', Number(e.target.value))}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="tw-retention">Keep activity (days)</Label>
          <Input
            id="tw-retention"
            type="number"
            min={7}
            max={3650}
            disabled={disabled}
            value={values.retentionDays}
            onChange={(e) => set('retentionDays', Number(e.target.value))}
          />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="tw-tone">Tone of voice</Label>
        <Textarea
          id="tw-tone"
          rows={3}
          disabled={disabled}
          placeholder="How posts should sound"
          value={values.toneOfVoice}
          onChange={(e) => set('toneOfVoice', e.target.value)}
        />
      </div>
      {save.isError && <p className="text-sm text-destructive">{save.error.message}</p>}
      {!disabled && (
        <Button size="sm" disabled={save.isPending} onClick={() => save.mutate(values)}>
          {save.isPending ? 'Saving…' : 'Save settings'}
        </Button>
      )}
    </section>
  );
}
