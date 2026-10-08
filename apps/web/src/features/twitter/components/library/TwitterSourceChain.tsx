'use client';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { TwitterItem } from '@/lib/api';
import { useTwitter } from '../../context/TwitterContext';
import { useTwitterDraftsQuery } from '../../services/twitter.service';
import { formatDate, safeHref } from '../../utils/twitter';
import TwitterBadge from '../TwitterBadge';

// The chain from one research item to the drafts written from it and the
// publications those drafts went out as.
export default function TwitterSourceChain({
  item,
  onClose,
}: {
  item: TwitterItem | null;
  onClose: () => void;
}) {
  const { projectKey } = useTwitter();
  const drafts = (useTwitterDraftsQuery(projectKey).data ?? []).filter((draft) =>
    item?.draftIds.includes(draft.id),
  );
  return (
    <Dialog open={item != null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Source chain</DialogTitle>
          <DialogDescription>
            Research item → drafts → publications through Buffer.
          </DialogDescription>
        </DialogHeader>
        {item && (
          <ol className="space-y-4 text-sm">
            <li>
              <p className="text-xs text-muted-foreground">Research item</p>
              <p className="break-words">
                @{item.authorHandle}: {item.text.slice(0, 160)}
              </p>
            </li>
            {drafts.length === 0 && (
              <li className="text-muted-foreground">Not used in a draft yet.</li>
            )}
            {drafts.map((draft) => (
              <li key={draft.id} className="space-y-1">
                <p className="text-xs text-muted-foreground">
                  Draft v{draft.currentVersion} · {formatDate(draft.updatedAt)}
                </p>
                <p className="break-words">{draft.posts[0]}</p>
                {draft.publications.map((job) => (
                  <p key={job.id} className="flex flex-wrap items-center gap-2 text-xs">
                    <TwitterBadge
                      tone={
                        job.status === 'failed'
                          ? 'bad'
                          : job.status === 'published'
                            ? 'good'
                            : 'muted'
                      }
                    >
                      {job.status}
                    </TwitterBadge>
                    Buffer {job.bufferPostId ?? '—'} · confirmed by{' '}
                    {job.confirmedByName ?? 'unknown'}
                    {safeHref(job.platformPostUrl) && (
                      <a
                        href={safeHref(job.platformPostUrl)!}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline"
                      >
                        on X
                      </a>
                    )}
                  </p>
                ))}
              </li>
            ))}
          </ol>
        )}
      </DialogContent>
    </Dialog>
  );
}
