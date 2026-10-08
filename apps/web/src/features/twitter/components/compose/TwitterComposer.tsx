'use client';

import { useState } from 'react';
import { Eye, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { TwitterDraft } from '@/lib/api';
import { useTwitter } from '../../context/TwitterContext';
import { useDraftEditor } from '../../hooks/useDraftEditor';
import { useTwitterSettingsQuery } from '../../services/twitter.service';
import TwitterMediaPicker from './TwitterMediaPicker';
import TwitterPostEditor from './TwitterPostEditor';
import TwitterPreviewPanel from './TwitterPreviewPanel';
import TwitterPublicationList from './TwitterPublicationList';
import TwitterPublishDialog from './TwitterPublishDialog';
import TwitterSourcesPanel from './TwitterSourcesPanel';
import TwitterVariationsPanel from './TwitterVariationsPanel';

export default function TwitterComposer({
  draft,
  contextIds,
  onCreated,
}: {
  draft: TwitterDraft | null;
  contextIds: string[];
  onCreated: (id: string) => void;
}) {
  const { projectKey, canCreate, canEdit, canPublish } = useTwitter();
  const settings = useTwitterSettingsQuery(projectKey).data;
  const editor = useDraftEditor(
    projectKey,
    draft,
    { tone: settings?.toneOfVoice ?? '', sourceIds: contextIds },
    onCreated,
  );
  const [publishing, setPublishing] = useState(false);
  const canWrite = draft ? canEdit && !editor.locked : canCreate;
  const status = editor.saving
    ? 'Saving…'
    : editor.saveError
      ? editor.saveError
      : !draft
        ? 'Not saved yet'
        : editor.dirty
          ? 'Unsaved changes'
          : `Saved · version ${draft.currentVersion}`;

  return (
    <div className="min-w-0 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-medium">{draft ? 'Edit draft' : 'New post'}</h2>
        <div className="flex items-center gap-2">
          <span
            className={
              editor.saveError ? 'text-xs text-destructive' : 'text-xs text-muted-foreground'
            }
          >
            {status}
          </span>
          {canWrite && (
            <Button
              size="sm"
              variant="outline"
              disabled={editor.saving || (!editor.dirty && draft != null)}
              onClick={editor.saveNow}
            >
              <Save className="size-3.5" /> Save draft
            </Button>
          )}
          {draft && canPublish && (
            <Button
              size="sm"
              disabled={editor.dirty || editor.locked}
              onClick={() => setPublishing(true)}
            >
              <Eye className="size-3.5" /> Preview &amp; publish
            </Button>
          )}
        </div>
      </div>
      {editor.locked && (
        <p className="rounded-md bg-muted/50 p-3 text-sm text-muted-foreground">
          This draft is {draft?.status} and can no longer be edited.
        </p>
      )}
      <TwitterPostEditor posts={editor.posts} onChange={editor.setPosts} disabled={!canWrite} />
      <div className="space-y-1.5">
        <Label htmlFor="twitter-tone">Tone of voice</Label>
        <Input
          id="twitter-tone"
          placeholder="Plain, factual, no hype"
          value={editor.tone}
          disabled={!canWrite}
          onChange={(e) => editor.setTone(e.target.value)}
        />
      </div>
      <TwitterSourcesPanel
        ids={editor.sourceIds}
        onChange={editor.setSourceIds}
        disabled={!canWrite}
      />
      <TwitterMediaPicker value={editor.media} onChange={editor.setMedia} disabled={!canWrite} />
      {canWrite && (
        <TwitterVariationsPanel
          text={editor.posts[0] ?? ''}
          tone={editor.tone}
          sourceIds={editor.sourceIds}
          onUse={(text) => editor.setPosts([text, ...editor.posts.slice(1)])}
        />
      )}
      {draft && !editor.dirty && <TwitterPreviewPanel draft={draft} />}
      {draft && <TwitterPublicationList draft={draft} />}
      {draft && (
        <TwitterPublishDialog
          draft={publishing ? draft : null}
          onClose={() => setPublishing(false)}
        />
      )}
    </div>
  );
}
