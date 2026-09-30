'use client';

import { Sparkles } from 'lucide-react';
import { useAiAgentsQuery, useHermesAgentsQuery } from '@/services/aiAgents.service';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import StudioVeraWorkspace from './StudioVeraWorkspace';

// Studio talks to Vera only. The API maps her agent to the vera-social Hermes
// profile; the browser sends nothing but the agent id and the message.
export default function StudioVeraPanel({
  projectKey,
  canCreateDraft,
}: {
  projectKey: string;
  canCreateDraft: boolean;
}) {
  const aiAgentsQuery = useAiAgentsQuery(projectKey);
  const hermesAgentsQuery = useHermesAgentsQuery(projectKey);
  const vera = hermesAgentsQuery.data?.find((agent) => agent.slug === 'vera');
  const agent = aiAgentsQuery.data?.find((candidate) => candidate.id === vera?.id);

  if (aiAgentsQuery.isLoading || hermesAgentsQuery.isLoading) {
    return <Skeleton className="h-[640px] rounded-lg" />;
  }
  if (!vera || !agent) {
    return (
      <Empty className="h-80 rounded-lg border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Sparkles />
          </EmptyMedia>
          <EmptyTitle>Vera is not connected</EmptyTitle>
          <EmptyDescription>
            Add an external AI agent with the username vera to this project, and set
            HERMES_VERA_PROJECT_KEY and HERMES_VERA_API_KEY on the API.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }
  return (
    <StudioVeraWorkspace
      projectKey={projectKey}
      agent={agent}
      ready={vera.status === 'ready'}
      canCreateDraft={canCreateDraft}
    />
  );
}
