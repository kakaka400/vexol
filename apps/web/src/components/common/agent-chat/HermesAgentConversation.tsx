'use client';

import { useEffect } from 'react';
import { Bot } from 'lucide-react';
import type { AiAgent } from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import { useHermesChat } from '@/hooks/useHermesChat';
import { AgentChatPanel } from './AgentChatPanel';
import { AiChatThreadSkeleton } from './AiChatThreadSkeleton';

export function HermesAgentConversation({
  projectKey,
  agent,
  conversationId,
  ready,
  subtitle,
  onReplied,
}: {
  projectKey: string;
  agent: AiAgent;
  conversationId: string;
  ready: boolean;
  subtitle: string;
  onReplied: () => void;
}) {
  const chat = useHermesChat(projectKey, agent.id, conversationId);

  useEffect(() => {
    if (chat.status === 'ready') onReplied();
  }, [chat.status, onReplied]);

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
          <div className="truncate text-xs text-muted-foreground">{subtitle}</div>
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
