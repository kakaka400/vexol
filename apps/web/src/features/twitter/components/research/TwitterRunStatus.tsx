import { NotebookText } from 'lucide-react';
import type { TwitterRun } from '@/lib/api';
import { useTwitter } from '../../context/TwitterContext';
import {
  formatDate,
  obsidianLink,
  runLabel,
  RUN_STATUS_LABEL,
  storageLabel,
} from '../../utils/twitter';
import TwitterBadge from '../TwitterBadge';

// The state of one run: status and step, sources, counts, and every warning,
// stop reason and error as the API reported it.
export default function TwitterRunStatus({ run }: { run: TwitterRun }) {
  const { vaultName } = useTwitter();
  const note = obsidianLink(vaultName, run.obsidianPath);
  const facts: Array<[string, string]> = [
    ['Status', RUN_STATUS_LABEL[run.status]],
    ['Step', run.step ?? '—'],
    ['Sources', run.adapters.join(', ') || '—'],
    ['Started', formatDate(run.startedAt ?? run.createdAt)],
    ['Found', String(run.foundCount)],
    ['Saved', `${run.storage.written} of ${run.storage.notes} notes`],
  ];
  if (run.retryCount > 0) {
    facts.push([
      'Retries',
      `${run.retryCount}${run.status === 'queued' && run.nextAttemptAt ? ` · next ${formatDate(run.nextAttemptAt)}` : ''}`,
    ]);
  }

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-medium break-words">{runLabel(run)}</h2>
        <div className="flex items-center gap-2">
          <TwitterBadge
            tone={run.storage.complete ? 'good' : run.storage.failed > 0 ? 'bad' : 'muted'}
          >
            {storageLabel(run)}
          </TwitterBadge>
          {note && (
            <a
              href={note}
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <NotebookText className="size-3" /> Run note
            </a>
          )}
        </div>
      </div>
      <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4">
        {facts.map(([label, value]) => (
          <div key={label}>
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      {run.stopReason && (
        <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          Stopped: {run.stopReason}
        </p>
      )}
      {run.lastError && run.status !== 'stopped' && (
        <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {run.lastError}
        </p>
      )}
      {run.warnings.length > 0 && (
        <ul className="space-y-1 rounded-md bg-muted/50 p-3 text-xs text-muted-foreground">
          {run.warnings.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      )}
    </section>
  );
}
