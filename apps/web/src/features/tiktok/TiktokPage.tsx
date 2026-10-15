'use client';

import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useShell } from '@/context/shellContext';
import { usePermissions } from '@/hooks/usePermissions';
import { HermesAgentPanel } from '@/components/common/agent-chat/HermesAgentPanel';
import SectionPageView from '@/components/common/page/SectionPageView';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import TiktokDraftsTab from './components/drafts/TiktokDraftsTab';
import TiktokLibraryTab from './components/library/TiktokLibraryTab';
import TiktokPostsTab from './components/posts/TiktokPostsTab';

export default function TiktokPage() {
  const { project } = useShell();
  const { can } = usePermissions();
  const queryClient = useQueryClient();
  const projectKey = project?.project.key ?? '';
  // A reply may have changed drafts or posted a video over MCP.
  const onReplied = useCallback(
    () => void queryClient.invalidateQueries({ queryKey: ['tiktok', projectKey] }),
    [queryClient, projectKey],
  );

  if (!project) return <Skeleton className="m-6 flex-1" />;
  if (!can('tiktok', 'read')) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        You do not have access to TikTok.
      </div>
    );
  }

  return (
    <SectionPageView
      title="TikTok"
      description="Keep animation prompts in the library, let the TikTok agent render them into video drafts, and post them through Buffer."
      wide
    >
      <Tabs key={projectKey} defaultValue="agent" className="pb-8">
        <TabsList variant="line" className="max-w-full overflow-x-auto overflow-y-hidden">
          <TabsTrigger value="agent">Agent</TabsTrigger>
          <TabsTrigger value="library">Library</TabsTrigger>
          <TabsTrigger value="drafts">Drafts</TabsTrigger>
          <TabsTrigger value="posts">Posts</TabsTrigger>
        </TabsList>
        <TabsContent value="agent" className="pt-4">
          <HermesAgentPanel
            projectKey={projectKey}
            slug="tiktok"
            label="TikTok agent"
            subtitle="Renders animations from your prompts and posts them through Buffer when you ask it to."
            onReplied={onReplied}
          />
        </TabsContent>
        <TabsContent value="library" className="pt-4">
          <TiktokLibraryTab
            projectKey={projectKey}
            canCreate={can('tiktok', 'create')}
            canEdit={can('tiktok', 'edit')}
            canDelete={can('tiktok', 'delete')}
          />
        </TabsContent>
        <TabsContent value="drafts" className="pt-4">
          <TiktokDraftsTab
            projectKey={projectKey}
            canCreate={can('tiktok', 'create')}
            canEdit={can('tiktok', 'edit')}
            canDelete={can('tiktok', 'delete')}
          />
        </TabsContent>
        <TabsContent value="posts" className="pt-4">
          <TiktokPostsTab projectKey={projectKey} />
        </TabsContent>
      </Tabs>
    </SectionPageView>
  );
}
