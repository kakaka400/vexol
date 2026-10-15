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
import { HermesAgentWorkspace } from './HermesAgentWorkspace';

// A chat with one Hermes agent of a section (LinkedIn, TikTok). The API maps the
// external agent to its Hermes profile by `slug`; the browser sends only the
// agent id and the message. `onReplied` runs after each reply, so the section
// can read again what the agent may have changed over MCP.
export function HermesAgentPanel({
  projectKey,
  slug,
  label,
  subtitle,
  onReplied,
}: {
  projectKey: string;
  slug: string;
  label: string;
  subtitle: string;
  onReplied: () => void;
}) {
  const aiAgentsQuery = useAiAgentsQuery(projectKey);
  const hermesAgentsQuery = useHermesAgentsQuery(projectKey);
  const route = hermesAgentsQuery.data?.find((agent) => agent.slug === slug);
  const agent = aiAgentsQuery.data?.find((candidate) => candidate.id === route?.id);

  if (aiAgentsQuery.isLoading || hermesAgentsQuery.isLoading) {
    return <Skeleton className="h-[600px] rounded-lg" />;
  }
  if (!route || !agent) {
    const env = `HERMES_${slug.toUpperCase()}`;
    return (
      <Empty className="h-80 rounded-lg border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Bot />
          </EmptyMedia>
          <EmptyTitle>The {label} is not connected</EmptyTitle>
          <EmptyDescription>
            {`Add an external AI agent with the username ${slug} to this project, and set ${env}_PROJECT_KEY and ${env}_API_KEY on the API.`}
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }
  return (
    <HermesAgentWorkspace
      projectKey={projectKey}
      agent={agent}
      ready={route.status === 'ready'}
      label={label}
      subtitle={subtitle}
      onReplied={onReplied}
    />
  );
}
