'use client';

import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useShell } from '@/context/shellContext';
import { usePermissions } from '@/hooks/usePermissions';
import { qk } from '@/services/queryKeys';
import { HermesAgentPanel } from '@/components/common/agent-chat/HermesAgentPanel';
import SectionPageView from '@/components/common/page/SectionPageView';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import LinkedinComposer from './components/LinkedinComposer';
import LinkedinPostList from './components/LinkedinPostList';

export default function LinkedinPage() {
  const { project } = useShell();
  const { can } = usePermissions();
  const queryClient = useQueryClient();
  const projectKey = project?.project.key ?? '';
  const onReplied = useCallback(
    () => void queryClient.invalidateQueries({ queryKey: qk.linkedinPosts(projectKey) }),
    [queryClient, projectKey],
  );

  if (!project) return <Skeleton className="m-6 flex-1" />;
  if (!can('linkedin', 'read')) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        You do not have access to LinkedIn.
      </div>
    );
  }

  return (
    <SectionPageView
      title="LinkedIn"
      description="Tell the LinkedIn agent what to post, or write a post yourself. Posts go out through Buffer."
      wide
    >
      <div className="grid gap-6 pb-8 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Tabs key={projectKey} defaultValue="agent">
          <TabsList variant="line">
            <TabsTrigger value="agent">Agent</TabsTrigger>
            <TabsTrigger value="manual">Write yourself</TabsTrigger>
          </TabsList>
          <TabsContent value="agent" className="pt-4">
            <HermesAgentPanel
              projectKey={projectKey}
              slug="linkedin"
              label="LinkedIn agent"
              subtitle="Publishes and schedules LinkedIn posts through Buffer when you ask it to."
              onReplied={onReplied}
            />
          </TabsContent>
          <TabsContent value="manual" className="pt-4">
            {can('linkedin', 'create') ? (
              <LinkedinComposer projectKey={projectKey} />
            ) : (
              <p className="text-sm text-muted-foreground">
                You can view posts but not publish them.
              </p>
            )}
          </TabsContent>
        </Tabs>
        <LinkedinPostList projectKey={projectKey} />
      </div>
    </SectionPageView>
  );
}
