'use client';

import { useState } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import type { TwitterItem, TwitterItemFilters as Filters } from '@/lib/api';
import { useTwitter } from '../../context/TwitterContext';
import {
  useTwitterItemsQuery,
  useTwitterRunsQuery,
  useTwitterTagsQuery,
} from '../../services/twitter.service';
import TwitterItemFilters from '../TwitterItemFilters';
import TwitterItemList from '../TwitterItemList';
import TwitterBulkBar from './TwitterBulkBar';
import TwitterSourceChain from './TwitterSourceChain';

// Everything research has stored. Obsidian holds the notes; this list is the
// database index of them, with a link to each note.
export default function TwitterLibraryTab({
  onUseAsContext,
}: {
  onUseAsContext: (ids: string[]) => void;
}) {
  const { projectKey } = useTwitter();
  const [filters, setFilters] = useState<Filters>({});
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [chainItem, setChainItem] = useState<TwitterItem | null>(null);
  const itemsQuery = useTwitterItemsQuery(projectKey, filters);
  const runs = useTwitterRunsQuery(projectKey).data ?? [];
  const tags = useTwitterTagsQuery(projectKey).data ?? [];
  const items = itemsQuery.data ?? [];

  return (
    <div className="space-y-4">
      <TwitterItemFilters value={filters} onChange={setFilters} tags={tags} runs={runs} />
      <TwitterBulkBar
        selected={selected}
        total={items.length}
        onSelectAll={() => setSelected(new Set(items.map((item) => item.id)))}
        onClear={() => setSelected(new Set())}
        onUseAsContext={() => onUseAsContext([...selected])}
      />
      {itemsQuery.isLoading ? (
        <Skeleton className="h-64" />
      ) : (
        <TwitterItemList
          items={items}
          selected={selected}
          onSelectedChange={setSelected}
          onShowChain={setChainItem}
          emptyTitle="The library is empty"
          emptyDescription="Posts appear here after a research run or when an agent hands them in."
        />
      )}
      <TwitterSourceChain item={chainItem} onClose={() => setChainItem(null)} />
    </div>
  );
}
