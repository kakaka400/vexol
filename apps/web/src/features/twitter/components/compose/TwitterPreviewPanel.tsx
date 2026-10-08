'use client';

import { Skeleton } from '@/components/ui/skeleton';
import type { TwitterDraft } from '@/lib/api';
import { useTwitter } from '../../context/TwitterContext';
import { useTwitterPreviewQuery } from '../../services/twitter.service';
import TwitterPreviewBody from './TwitterPreviewBody';

// The server's preview of the saved version: the same check the publish step runs.
export default function TwitterPreviewPanel({ draft }: { draft: TwitterDraft }) {
  const { projectKey } = useTwitter();
  const preview = useTwitterPreviewQuery(projectKey, draft);
  return (
    <section className="space-y-2">
      <h3 className="text-sm font-medium">Preview · version {draft.currentVersion}</h3>
      {preview.data ? <TwitterPreviewBody preview={preview.data} /> : <Skeleton className="h-24" />}
    </section>
  );
}
