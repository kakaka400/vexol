'use client';

import { useState } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { useTwitter } from '../../context/TwitterContext';
import { useTwitterDraftsQuery } from '../../services/twitter.service';
import TwitterComposer from './TwitterComposer';
import TwitterDraftList from './TwitterDraftList';

export default function TwitterComposeTab({
  contextIds,
  onContextChange,
}: {
  contextIds: string[];
  onContextChange: (ids: string[]) => void;
}) {
  const { projectKey } = useTwitter();
  const draftsQuery = useTwitterDraftsQuery(projectKey);
  const [openId, setOpenId] = useState<string | null>(null);
  const drafts = draftsQuery.data ?? [];
  const open = openId ? (drafts.find((draft) => draft.id === openId) ?? null) : null;

  if (draftsQuery.isLoading) return <Skeleton className="h-64" />;

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,300px)_minmax(0,1fr)]">
      <TwitterDraftList drafts={drafts} activeId={openId} onOpen={setOpenId} />
      <TwitterComposer
        key={open?.id ?? 'new'}
        draft={open}
        contextIds={contextIds}
        onCreated={(id) => {
          setOpenId(id);
          onContextChange([]);
        }}
      />
    </div>
  );
}
