'use client';

import { CalendarClock, Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { StudioDraft } from '@/lib/api';
import { formatDateTime } from '@/utils/dates';
import StudioDraftStatusBadge from './StudioDraftStatusBadge';

// The drafts Vera made, as cards with their image, so a person can look them over
// and schedule them. A rejected or already scheduled draft cannot be scheduled
// from here; opening it shows why.
export default function StudioVeraPosts({
  drafts,
  canSchedule,
  onOpen,
  onSchedule,
}: {
  drafts: StudioDraft[];
  canSchedule: boolean;
  onOpen: (draftId: string) => void;
  onSchedule: (draft: StudioDraft) => void;
}) {
  if (drafts.length === 0) {
    return (
      <div className="rounded-lg border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">
        Vera has not made any posts yet. Ask her in the Vera tab to make one from a template.
      </div>
    );
  }
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {drafts.map((draft) => {
        const schedulable = draft.status !== 'scheduled' && draft.status !== 'rejected';
        return (
          <div key={draft.id} className="flex flex-col overflow-hidden rounded-lg border bg-card">
            <button
              type="button"
              className="aspect-[4/5] bg-muted/40"
              onClick={() => onOpen(draft.id)}
            >
              {draft.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- a public API image URL
                <img
                  src={draft.imageUrl}
                  alt=""
                  loading="lazy"
                  className="size-full object-contain"
                />
              ) : (
                <span className="text-xs text-muted-foreground">No image</span>
              )}
            </button>
            <div className="flex flex-1 flex-col gap-2 p-3">
              <div className="flex items-center gap-2">
                <StudioDraftStatusBadge status={draft.status} />
                <span className="text-xs text-muted-foreground">v{draft.currentVersion}</span>
              </div>
              <p className="line-clamp-3 text-sm">{draft.caption}</p>
              <p className="mt-auto text-xs text-muted-foreground">
                {draft.scheduledFor
                  ? `Goes out ${formatDateTime(draft.scheduledFor)}`
                  : `Made ${formatDateTime(draft.createdAt)}`}
              </p>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="flex-1"
                  onClick={() => onOpen(draft.id)}
                >
                  <Eye className="size-3.5" />
                  Open
                </Button>
                {canSchedule && schedulable && (
                  <Button size="sm" className="flex-1" onClick={() => onSchedule(draft)}>
                    <CalendarClock className="size-3.5" />
                    Schedule
                  </Button>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
