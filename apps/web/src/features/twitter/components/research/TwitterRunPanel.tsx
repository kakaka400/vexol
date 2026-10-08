'use client';

import { useEffect, useState } from 'react';
import { PenLine } from 'lucide-react';
import { EmptyState } from '@/components/common/page/EmptyState';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import type { TwitterItemFilters as Filters, TwitterRun } from '@/lib/api';
import { useTwitter } from '../../context/TwitterContext';
import {
  useTwitterItemsQuery,
  useTwitterRunQuery,
  useTwitterTagsQuery,
} from '../../services/twitter.service';
import TwitterItemFilters from '../TwitterItemFilters';
import TwitterItemList from '../TwitterItemList';
import TwitterRunStatus from './TwitterRunStatus';

// The open run and its results, with the library filters scoped to the run.
export default function TwitterRunPanel({
  runId,
  runs,
  onUseAsContext,
}: {
  runId: string | null;
  runs: TwitterRun[];
  onUseAsContext: (ids: string[]) => void;
}) {
  const { projectKey } = useTwitter();
  const runQuery = useTwitterRunQuery(projectKey, runId);
  const [filters, setFilters] = useState<Filters>({});
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const scoped = { ...filters, runId: filters.runId ?? runId ?? undefined };
  const itemsQuery = useTwitterItemsQuery(projectKey, scoped, runId != null);
  const tags = useTwitterTagsQuery(projectKey).data ?? [];
  const { refetch } = itemsQuery;
  // The run's results grow while it runs and their notes are written, so the list
  // is read again whenever the run moves on.
  const progress = runQuery.data ? `${runQuery.data.status}:${runQuery.data.storage.written}` : '';
  useEffect(() => {
    if (progress) void refetch();
  }, [progress, refetch]);

  if (!runId) {
    return (
      <EmptyState
        title="No research yet"
        description="Start a research run: every post it finds is stored in the library and written to Obsidian."
      />
    );
  }
  if (!runQuery.data) return <Skeleton className="h-64" />;

  return (
    <div className="min-w-0 space-y-6">
      <TwitterRunStatus run={runQuery.data} />
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-medium">Results</h3>
          <Button
            size="sm"
            variant="outline"
            disabled={selected.size === 0}
            onClick={() => onUseAsContext([...selected])}
          >
            <PenLine className="size-3.5" /> Use {selected.size || ''} as context
          </Button>
        </div>
        <TwitterItemFilters value={scoped} onChange={setFilters} tags={tags} runs={runs} />
        {itemsQuery.isLoading ? (
          <Skeleton className="h-40" />
        ) : (
          <TwitterItemList
            items={itemsQuery.data ?? []}
            selected={selected}
            onSelectedChange={setSelected}
            emptyTitle={
              runQuery.data.status === 'queued' || runQuery.data.status === 'running'
                ? 'Collecting…'
                : 'No posts'
            }
          />
        )}
      </section>
    </div>
  );
}
