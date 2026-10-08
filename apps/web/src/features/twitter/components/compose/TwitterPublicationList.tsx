'use client';

import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { TwitterDraft } from '@/lib/api';
import { useTwitter } from '../../context/TwitterContext';
import { useRefreshPublishJob } from '../../services/twitter.service';
import { formatDate, safeHref } from '../../utils/twitter';
import TwitterBadge from '../TwitterBadge';

const STATUS_LABEL = {
  pending: 'Sending',
  unknown: 'Outcome unknown',
  scheduled: 'Accepted by Buffer',
  published: 'Published',
  failed: 'Failed',
} as const;

export default function TwitterPublicationList({ draft }: { draft: TwitterDraft }) {
  const { projectKey } = useTwitter();
  const refresh = useRefreshPublishJob(projectKey);
  if (draft.publications.length === 0) return null;
  return (
    <section className="space-y-2">
      <h3 className="text-sm font-medium">Publications</h3>
      <ul className="space-y-2 text-sm">
        {draft.publications.map((job) => (
          <li key={job.id} className="space-y-1 rounded-md bg-muted/40 p-3">
            <div className="flex flex-wrap items-center gap-2">
              <TwitterBadge
                tone={
                  job.status === 'failed' ? 'bad' : job.status === 'published' ? 'good' : 'muted'
                }
              >
                {STATUS_LABEL[job.status]}
              </TwitterBadge>
              <span className="text-muted-foreground">
                {job.mode === 'now'
                  ? 'Publish now'
                  : `Scheduled for ${formatDate(job.scheduledFor)} (${job.timezone})`}{' '}
                · @{job.accountHandle ?? job.accountId} · v{job.version}
              </span>
              {job.status === 'scheduled' && (
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={refresh.isPending}
                  onClick={() => refresh.mutate(job.id)}
                >
                  <RefreshCw className="size-3.5" /> Refresh status
                </Button>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Confirmed by {job.confirmedByName ?? 'unknown'} on {formatDate(job.confirmedAt)} ·
              Buffer {job.bufferPostId ?? '—'}
              {safeHref(job.platformPostUrl) && (
                <>
                  {' · '}
                  <a
                    href={safeHref(job.platformPostUrl)!}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline"
                  >
                    view on X
                  </a>
                </>
              )}
            </p>
            {job.lastError && <p className="text-xs text-destructive">{job.lastError}</p>}
            {job.status === 'unknown' && (
              <p className="text-xs text-muted-foreground">
                Buffer did not answer. Publishing again with the same account and time is safe: it
                first checks Buffer for the post.
              </p>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
