'use client';

import { FilePlus2, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import type { AiAgent } from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { AgentChatPanel } from '@/components/common/agent-chat/AgentChatPanel';
import { AiChatThreadSkeleton } from '@/components/common/agent-chat/AiChatThreadSkeleton';
import { useHermesChat } from '@/hooks/useHermesChat';
import { useCreateStudioDraft } from '../services/studio.service';

// The API allows 2200 characters, the Instagram caption limit.
const CAPTION_LIMIT = 2200;

export default function StudioVeraConversation({
  projectKey,
  agent,
  conversationId,
  ready,
  canCreateDraft,
}: {
  projectKey: string;
  agent: AiAgent;
  conversationId: string;
  ready: boolean;
  canCreateDraft: boolean;
}) {
  const chat = useHermesChat(projectKey, agent.id, conversationId);
  const createDraft = useCreateStudioDraft(projectKey);
  const lastReply =
    chat.status === 'ready'
      ? [...chat.messages].reverse().find((message) => message.role === 'assistant' && message.text)
      : undefined;

  const saveDraft = () => {
    if (!lastReply) return;
    const caption = lastReply.text.trim();
    if (caption.length > CAPTION_LIMIT) {
      toast.error(`A caption can be at most ${CAPTION_LIMIT} characters. Ask Vera to shorten it.`);
      return;
    }
    createDraft.mutate({ caption, conversationId });
  };

  return (
    <>
      <div className="flex items-center gap-3 border-b px-4 py-2.5">
        <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Sparkles className="size-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-medium">{agent.name}</span>
            <Badge variant={ready ? 'secondary' : 'outline'}>{ready ? 'Ready' : 'Offline'}</Badge>
          </div>
          <div className="truncate text-xs text-muted-foreground">
            Social media drafts. Vera cannot publish or approve.
          </div>
        </div>
        {canCreateDraft && (
          <Button
            size="sm"
            variant="outline"
            onClick={saveDraft}
            disabled={!lastReply || createDraft.isPending}
          >
            <FilePlus2 className="size-3.5" />
            Save last reply as draft
          </Button>
        )}
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
