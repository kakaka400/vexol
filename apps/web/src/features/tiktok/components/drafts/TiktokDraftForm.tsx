'use client';

import { useState } from 'react';
import type { TiktokDraft } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useSaveTiktokDraft } from '../../services/tiktok.service';
import { EMPTY_ANIMATION, TIKTOK_CAPTION_MAX_LENGTH } from '../../utils/tiktok';
import TiktokAnimationFields from '../TiktokAnimationFields';
import TiktokTemplatePicker from './TiktokTemplatePicker';

export default function TiktokDraftForm({
  projectKey,
  draft,
  onDone,
}: {
  projectKey: string;
  draft: TiktokDraft | null;
  onDone: () => void;
}) {
  const [title, setTitle] = useState(draft?.title ?? '');
  const [templateId, setTemplateId] = useState<string | undefined>(undefined);
  const [animation, setAnimation] = useState(
    draft
      ? {
          prompt: draft.prompt,
          colors: draft.colors,
          style: draft.style,
          durationSeconds: draft.durationSeconds,
        }
      : EMPTY_ANIMATION,
  );
  const [caption, setCaption] = useState(draft?.caption ?? '');
  const [videoUrl, setVideoUrl] = useState(draft?.videoUrl ?? '');
  const save = useSaveTiktokDraft(projectKey);

  const video = videoUrl.trim();
  const issues = [
    caption.length > TIKTOK_CAPTION_MAX_LENGTH &&
      `The caption is longer than ${TIKTOK_CAPTION_MAX_LENGTH} characters`,
    video !== '' && !video.startsWith('https://') && 'The video URL must start with https://',
  ].filter((issue): issue is string => typeof issue === 'string');
  const ready = title.trim() !== '' && animation.prompt.trim() !== '' && issues.length === 0;

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="tiktok-draft-title">Title</Label>
        <Input
          id="tiktok-draft-title"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
        />
      </div>
      {!draft && (
        <TiktokTemplatePicker
          projectKey={projectKey}
          value={templateId}
          onPick={(template) => {
            setTemplateId(template.id);
            setAnimation({
              prompt: template.prompt,
              colors: template.colors,
              style: template.style,
              durationSeconds: template.durationSeconds,
            });
          }}
        />
      )}
      <TiktokAnimationFields value={animation} onChange={setAnimation} />
      <div className="space-y-1.5">
        <Label htmlFor="tiktok-caption">Caption</Label>
        <Textarea
          id="tiktok-caption"
          value={caption}
          onChange={(event) => setCaption(event.target.value)}
          rows={3}
          placeholder="Text and hashtags under the video"
        />
        <p className="text-right text-xs text-muted-foreground">
          {caption.length} / {TIKTOK_CAPTION_MAX_LENGTH}
        </p>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="tiktok-video">Video URL</Label>
        <Input
          id="tiktok-video"
          value={videoUrl}
          onChange={(event) => setVideoUrl(event.target.value)}
          placeholder="Set by the agent once the video is rendered"
        />
      </div>
      {[...issues, ...(save.isError ? [save.error.message] : [])].map((issue) => (
        <p key={issue} className="text-sm text-destructive">
          {issue}
        </p>
      ))}
      <DialogFooter>
        <Button variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button
          disabled={!ready || save.isPending}
          onClick={() =>
            save.mutate(
              {
                id: draft?.id ?? null,
                values: {
                  title: title.trim(),
                  templateId,
                  ...animation,
                  caption,
                  videoUrl: video || (draft ? null : undefined),
                },
              },
              { onSuccess: onDone },
            )
          }
        >
          {save.isPending ? 'Saving…' : 'Save'}
        </Button>
      </DialogFooter>
    </div>
  );
}
