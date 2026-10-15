'use client';

import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Bot } from 'lucide-react';
import type { AiAgent } from '@/lib/api';
import { qk } from '@/services/queryKeys';
import { Badge } from '@/components/ui/badge';
import { AgentChatPanel } from '@/components/common/agent-chat/AgentChatPanel';
import { AiChatThreadSkeleton } from '@/components/common/agent-chat/AiChatThreadSkeleton';
import { useHermesChat } from '@/hooks/useHermesChat';

export default function LinkedinAgentConversation({
  projectKey,
  agent,
  conversationId,
  ready,
}: {
  projectKey: string;
  agent: AiAgent;
  conversationId: string;
  ready: boolean;
}) {
  const queryClient = useQueryClient();
  const chat = useHermesChat(projectKey, agent.id, conversationId);

  // A reply may have sent a post through MCP, so the post list is read again.
  useEffect(() => {
    if (chat.status === 'ready') {
      void queryClient.invalidateQueries({ queryKey: qk.linkedinPosts(projectKey) });
    }
  }, [chat.status, projectKey, queryClient]);

  return (
    <>
      <div className="flex items-center gap-3 border-b px-4 py-2.5">
        <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Bot className="size-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-medium">{agent.name}</span>
            <Badge variant={ready ? 'secondary' : 'outline'}>{ready ? 'Ready' : 'Offline'}</Badge>
          </div>
          <div className="truncate text-xs text-muted-foreground">
            Publishes and schedules LinkedIn posts through Buffer when you ask it to.
          </div>
        </div>
      </div>
      <div className="min-h-0 flex-1">
        {chat.isLoading ? (
          <AiChatThreadSkeleton />
        ) : (
          <AgentChatPanel
            agent={agent}
            messages={chat.messages}
            status={chat.status}
            activeTool={chat.activeTool}
            onSend={chat.send}
          />
        )}
      </div>
    </>
  );
}
