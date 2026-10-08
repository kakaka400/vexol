'use client';

import { useState } from 'react';
import { useShell } from '@/context/shellContext';
import { usePermissions } from '@/hooks/usePermissions';
import SectionPageView from '@/components/common/page/SectionPageView';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import TwitterActivityTab from './components/activity/TwitterActivityTab';
import TwitterComposeTab from './components/compose/TwitterComposeTab';
import TwitterLibraryTab from './components/library/TwitterLibraryTab';
import TwitterResearchTab from './components/research/TwitterResearchTab';
import { TwitterContext } from './context/TwitterContext';
import { useTwitterStatusQuery } from './services/twitter.service';

export default function TwitterPage() {
  const { project } = useShell();
  const { can } = usePermissions();
  const projectKey = project?.project.key ?? '';
  const [tab, setTab] = useState('research');
  // The library items chosen as context for the next draft.
  const [contextIds, setContextIds] = useState<string[]>([]);
  const statusQuery = useTwitterStatusQuery(projectKey);

  if (!project) return <Skeleton className="m-6 flex-1" />;
  if (!can('twitter', 'read')) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        You do not have access to Twitter.
      </div>
    );
  }

  const useAsContext = (ids: string[]) => {
    setContextIds(ids);
    setTab('compose');
  };

  return (
    <TwitterContext.Provider
      value={{
        projectKey,
        vaultName: statusQuery.data?.obsidian.vaultName ?? null,
        canCreate: can('twitter', 'create'),
        canEdit: can('twitter', 'edit'),
        canPublish: can('twitter_publish', 'create'),
        canUseStudio: can('studio', 'read'),
      }}
    >
      <SectionPageView
        title="Twitter"
        description="Research public posts on X, keep every result in Obsidian, and publish posts through Zernio after you confirm them."
        wide
      >
        <Tabs key={projectKey} value={tab} onValueChange={setTab} className="pb-8">
          <TabsList variant="line" className="max-w-full overflow-x-auto overflow-y-hidden">
            <TabsTrigger value="research">Research</TabsTrigger>
            <TabsTrigger value="library">Library</TabsTrigger>
            <TabsTrigger value="compose">
              Compose &amp; Publish
              {contextIds.length > 0 && (
                <span className="text-xs text-muted-foreground">{contextIds.length}</span>
              )}
            </TabsTrigger>
            <TabsTrigger value="activity">Activity &amp; Settings</TabsTrigger>
          </TabsList>
          <TabsContent value="research" className="pt-4">
            <TwitterResearchTab onUseAsContext={useAsContext} />
          </TabsContent>
          <TabsContent value="library" className="pt-4">
            <TwitterLibraryTab onUseAsContext={useAsContext} />
          </TabsContent>
          <TabsContent value="compose" className="pt-4">
            <TwitterComposeTab contextIds={contextIds} onContextChange={setContextIds} />
          </TabsContent>
          <TabsContent value="activity" className="pt-4">
            <TwitterActivityTab status={statusQuery.data ?? null} />
          </TabsContent>
        </Tabs>
      </SectionPageView>
    </TwitterContext.Provider>
  );
}
