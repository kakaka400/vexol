'use client';

import { Bot } from 'lucide-react';
import { useAiAgentsQuery, useHermesAgentsQuery } from '@/services/aiAgents.service';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import LinkedinAgentWorkspace from './LinkedinAgentWorkspace';

// The API maps the external agent with the username linkedin to the LinkedIn
// profile in Hermes; the browser sends only the agent id and the message.
export default function LinkedinAgentPanel({ projectKey }: { projectKey: string }) {
  const aiAgentsQuery = useAiAgentsQuery(projectKey);
  const hermesAgentsQuery = useHermesAgentsQuery(projectKey);
  const route = hermesAgentsQuery.data?.find((agent) => agent.slug === 'linkedin');
  const agent = aiAgentsQuery.data?.find((candidate) => candidate.id === route?.id);

  if (aiAgentsQuery.isLoading || hermesAgentsQuery.isLoading) {
    return <Skeleton className="h-[600px] rounded-lg" />;
  }
  if (!route || !agent) {
    return (
      <Empty className="h-80 rounded-lg border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Bot />
          </EmptyMedia>
          <EmptyTitle>The LinkedIn agent is not connected</EmptyTitle>
          <EmptyDescription>
            Add an external AI agent with the username linkedin to this project, and set
            HERMES_LINKEDIN_PROJECT_KEY and HERMES_LINKEDIN_API_KEY on the API.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }
  return (
    <LinkedinAgentWorkspace
      projectKey={projectKey}
      agent={agent}
      ready={route.status === 'ready'}
    />
  );
}
