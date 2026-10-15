'use client';

import { useState } from 'react';
import { Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useCreateLinkedinPost } from '../services/linkedin.service';
import { LINKEDIN_MAX_IMAGES, LINKEDIN_MAX_LENGTH, splitLines } from '../utils/linkedin';
import LinkedinTargetFields, { type LinkedinTarget } from './LinkedinTargetFields';

const EMPTY_TARGET: LinkedinTarget = { channelId: '', mode: 'schedule', when: '' };

// Nothing goes to Buffer until the person ticks the confirmation.
export default function LinkedinComposer({ projectKey }: { projectKey: string }) {
  const [text, setText] = useState('');
  const [images, setImages] = useState('');
  const [target, setTarget] = useState(EMPTY_TARGET);
  const [confirmed, setConfirmed] = useState(false);
  const create = useCreateLinkedinPost(projectKey);

  const imageUrls = splitLines(images);
  const issues = [
    text.length > LINKEDIN_MAX_LENGTH &&
      `The text is longer than ${LINKEDIN_MAX_LENGTH} characters`,
    imageUrls.length > LINKEDIN_MAX_IMAGES && `At most ${LINKEDIN_MAX_IMAGES} images`,
    imageUrls.some((url) => !url.startsWith('https://')) && 'Image URLs must start with https://',
  ].filter((issue): issue is string => typeof issue === 'string');
  const ready =
    text.trim().length > 0 &&
    issues.length === 0 &&
    target.channelId !== '' &&
    (target.mode === 'now' || target.when !== '');

  const change = (next: LinkedinTarget) => {
    setTarget(next);
    setConfirmed(false);
  };

  const submit = () =>
    create.mutate(
      {
        text,
        imageUrls,
        channelId: target.channelId,
        mode: target.mode,
        scheduledFor: target.mode === 'schedule' ? new Date(target.when).toISOString() : undefined,
        idempotencyKey: crypto.randomUUID(),
      },
      {
        onSuccess: (post) => {
          if (post.status === 'failed') return;
          setText('');
          setImages('');
          setTarget({ ...EMPTY_TARGET, channelId: target.channelId });
          setConfirmed(false);
        },
      },
    );

  return (
    <section className="space-y-5 rounded-lg border p-4">
      <h2 className="text-sm font-medium">New post</h2>
      <div className="space-y-1.5">
        <Label htmlFor="linkedin-text">Text</Label>
        <Textarea
          id="linkedin-text"
          value={text}
          onChange={(event) => {
            setText(event.target.value);
            setConfirmed(false);
          }}
          rows={10}
          placeholder="What do you want to share on LinkedIn?"
        />
        <p className="text-right text-xs text-muted-foreground">
          {text.length} / {LINKEDIN_MAX_LENGTH}
        </p>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="linkedin-images">Image URLs (optional, one per line)</Label>
        <Textarea
          id="linkedin-images"
          value={images}
          onChange={(event) => setImages(event.target.value)}
          rows={2}
          placeholder="https://…"
        />
      </div>
      <LinkedinTargetFields projectKey={projectKey} value={target} onChange={change} />
      {issues.map((issue) => (
        <p key={issue} className="text-sm text-destructive">
          {issue}
        </p>
      ))}
      {ready && (
        <label className="flex items-start gap-2 text-sm">
          <Checkbox
            checked={confirmed}
            onCheckedChange={(value) => setConfirmed(value === true)}
            className="mt-0.5"
          />
          <span>
            I checked this post and confirm it goes to LinkedIn{' '}
            {target.mode === 'now' ? 'now' : `on ${target.when.replace('T', ' ')}`}.
          </span>
        </label>
      )}
      {create.isError && <p className="text-sm text-destructive">{create.error.message}</p>}
      <div className="flex justify-end">
        <Button disabled={!ready || !confirmed || create.isPending} onClick={submit}>
          <Send className="size-3.5" />
          {create.isPending ? 'Sending…' : target.mode === 'now' ? 'Publish now' : 'Schedule'}
        </Button>
      </div>
    </section>
  );
}
