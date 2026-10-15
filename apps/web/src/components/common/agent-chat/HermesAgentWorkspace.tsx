'use client';

import { useState } from 'react';
import { Plus } from 'lucide-react';
import type { AiAgent } from '@/lib/api';
import {
  useCreateHermesConversation,
  useHermesConversationsQuery,
} from '@/services/aiAgents.service';
import { Button } from '@/components/ui/button';
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty';
import { HermesAgentConversation } from './HermesAgentConversation';
import { HermesConversationList } from './HermesConversationList';

export function HermesAgentWorkspace({
  projectKey,
  agent,
  ready,
  label,
  subtitle,
  onReplied,
}: {
  projectKey: string;
  agent: AiAgent;
  ready: boolean;
  label: string;
  subtitle: string;
  onReplied: () => void;
}) {
  const conversationsQuery = useHermesConversationsQuery(projectKey, agent.id);
  const conversations = conversationsQuery.data ?? [];
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const activeId = selectedId ?? conversations[0]?.id ?? null;
  const createConversation = useCreateHermesConversation(projectKey, agent.id);

  const startNewChat = async () => {
    const conversation = await createConversation.mutateAsync();
    setSelectedId(conversation.id);
  };

  return (
    <div className="grid h-[600px] grid-rows-[auto_1fr] overflow-hidden rounded-lg border bg-card md:grid-cols-[14rem_1fr] md:grid-rows-1">
      <div className="flex max-h-44 min-h-0 flex-col border-b md:max-h-none md:border-r md:border-b-0">
        <div className="flex items-center justify-between border-b px-3 py-2.5">
          <span className="text-sm font-medium">Conversations</span>
          <Button
            size="sm"
            variant="ghost"
            onClick={startNewChat}
            disabled={!ready || createConversation.isPending}
          >
            <Plus className="size-3.5" />
            New
          </Button>
        </div>
        <HermesConversationList
          projectKey={projectKey}
          agentId={agent.id}
          conversations={conversations}
          isLoading={conversationsQuery.isLoading}
          selectedConversationId={activeId}
          onSelect={setSelectedId}
          onArchived={(id) => {
            if (id === activeId) setSelectedId(null);
          }}
        />
      </div>
      <div className="flex min-h-0 flex-col">
        {activeId ? (
          <HermesAgentConversation
            key={activeId}
            projectKey={projectKey}
            agent={agent}
            conversationId={activeId}
            ready={ready}
            subtitle={subtitle}
            onReplied={onReplied}
          />
        ) : (
          <Empty className="h-full">
            <EmptyHeader>
              <EmptyTitle>Give the agent a task</EmptyTitle>
              <EmptyDescription>
                {ready
                  ? 'Open a conversation and say what you need.'
                  : `The ${label} is offline. The Hermes gateway did not answer the readiness check.`}
              </EmptyDescription>
            </EmptyHeader>
            <Button onClick={startNewChat} disabled={!ready || createConversation.isPending}>
              <Plus className="size-4" />
              New conversation
            </Button>
          </Empty>
        )}
      </div>
    </div>
  );
}
