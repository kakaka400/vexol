import type { TwitterRun } from '@/lib/api';
import { cn } from '@/lib/utils';
import { formatDate, runLabel, RUN_STATUS_LABEL } from '../../utils/twitter';
import TwitterBadge from '../TwitterBadge';

const STATUS_TONE = {
  queued: 'muted',
  running: 'muted',
  completed: 'good',
  partial: 'muted',
  stopped: 'bad',
  failed: 'bad',
} as const;

export default function TwitterRunList({
  runs,
  activeId,
  onOpen,
}: {
  runs: TwitterRun[];
  activeId: string | null;
  onOpen: (runId: string) => void;
}) {
  return (
    <section className="space-y-2">
      <h2 className="text-sm font-medium">Research runs</h2>
      {runs.length === 0 && <p className="text-sm text-muted-foreground">No research yet.</p>}
      <ul className="space-y-1">
        {runs.map((run) => (
          <li key={run.id}>
            <button
              type="button"
              onClick={() => onOpen(run.id)}
              className={cn(
                'w-full rounded-md px-3 py-2 text-left transition-colors hover:bg-accent',
                run.id === activeId && 'bg-accent',
              )}
            >
              <span className="line-clamp-1 text-sm">{runLabel(run)}</span>
              <span className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                <TwitterBadge tone={STATUS_TONE[run.status]}>
                  {RUN_STATUS_LABEL[run.status]}
                </TwitterBadge>
                {run.foundCount} posts · {formatDate(run.createdAt)}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
