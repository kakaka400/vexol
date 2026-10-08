import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { TwitterDraft } from '@/lib/api';
import { cn } from '@/lib/utils';
import { formatDate } from '../../utils/twitter';
import TwitterBadge from '../TwitterBadge';

const STATUS_TONE = {
  draft: 'muted',
  scheduled: 'good',
  published: 'good',
  failed: 'bad',
} as const;

export default function TwitterDraftList({
  drafts,
  activeId,
  onOpen,
}: {
  drafts: TwitterDraft[];
  activeId: string | null;
  onOpen: (id: string | null) => void;
}) {
  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium">Drafts</h2>
        <Button size="sm" variant="ghost" onClick={() => onOpen(null)}>
          <Plus className="size-3.5" /> New
        </Button>
      </div>
      {drafts.length === 0 && <p className="text-sm text-muted-foreground">No drafts yet.</p>}
      <ul className="space-y-1">
        {drafts.map((draft) => (
          <li key={draft.id}>
            <button
              type="button"
              onClick={() => onOpen(draft.id)}
              className={cn(
                'w-full rounded-md px-3 py-2 text-left transition-colors hover:bg-accent',
                draft.id === activeId && 'bg-accent',
              )}
            >
              <span className="line-clamp-2 text-sm">{draft.posts[0]}</span>
              <span className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                <TwitterBadge tone={STATUS_TONE[draft.status]}>{draft.status}</TwitterBadge>
                {draft.kind === 'thread' ? `Thread of ${draft.posts.length}` : 'Post'} · v
                {draft.currentVersion} · {formatDate(draft.updatedAt)}
                {draft.createdByAgent && ' · by an agent'}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
