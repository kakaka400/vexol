'use client';

import { useState } from 'react';
import { useTwitter } from '../../context/TwitterContext';
import { useTwitterRunsQuery } from '../../services/twitter.service';
import TwitterResearchForm from './TwitterResearchForm';
import TwitterRunList from './TwitterRunList';
import TwitterRunPanel from './TwitterRunPanel';

export default function TwitterResearchTab({
  onUseAsContext,
}: {
  onUseAsContext: (ids: string[]) => void;
}) {
  const { projectKey, canCreate } = useTwitter();
  const runsQuery = useTwitterRunsQuery(projectKey);
  const [chosenRunId, setChosenRunId] = useState<string | null>(null);
  const runs = runsQuery.data ?? [];
  const runId = chosenRunId ?? runs[0]?.id ?? null;

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
      <div className="space-y-8">
        {canCreate ? (
          <TwitterResearchForm onStarted={setChosenRunId} />
        ) : (
          <p className="text-sm text-muted-foreground">
            You can read research here; starting research needs the Twitter create permission.
          </p>
        )}
        <TwitterRunList runs={runs} activeId={runId} onOpen={setChosenRunId} />
      </div>
      <TwitterRunPanel runId={runId} runs={runs} onUseAsContext={onUseAsContext} />
    </div>
  );
}
