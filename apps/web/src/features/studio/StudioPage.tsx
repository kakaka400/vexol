'use client';

import { useState } from 'react';
import { useShell } from '@/context/shellContext';
import { usePermissions } from '@/hooks/usePermissions';
import SectionPageView from '@/components/common/page/SectionPageView';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import StudioDraftDialog from './components/StudioDraftDialog';
import StudioDraftList from './components/StudioDraftList';
import StudioPostGrid from './components/StudioPostGrid';
import StudioScheduleDialog from './components/StudioScheduleDialog';
import StudioTemplateGrid from './components/StudioTemplateGrid';
import StudioVeraPanel from './components/StudioVeraPanel';
import StudioVeraPosts from './components/StudioVeraPosts';
import type { StudioDraft } from '@/lib/api';
import {
  useStudioDraftsQuery,
  useStudioPostsQuery,
  useStudioTemplatesQuery,
} from './services/studio.service';

export default function StudioPage() {
  const { project } = useShell();
  const { can } = usePermissions();
  const projectKey = project?.project.key ?? '';
  const [openDraftId, setOpenDraftId] = useState<string | null>(null);
  const [schedulingDraft, setSchedulingDraft] = useState<StudioDraft | null>(null);

  const templatesQuery = useStudioTemplatesQuery(projectKey);
  const postsQuery = useStudioPostsQuery(projectKey);
  const draftsQuery = useStudioDraftsQuery(projectKey);

  if (!project || templatesQuery.isLoading || postsQuery.isLoading || draftsQuery.isLoading) {
    return <Skeleton className="m-6 flex-1" />;
  }
  if (!can('studio', 'read')) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        You do not have access to Studio.
      </div>
    );
  }
  const canChat = can('ai_agents', 'read');
  const veraDrafts = (draftsQuery.data ?? []).filter((draft) => draft.createdByAgent);

  return (
    <SectionPageView
      title="Studio"
      description="Brief Vera, keep her drafts, and approve each version before it is scheduled."
      wide
    >
      <Tabs key={projectKey} defaultValue={canChat ? 'vera' : 'drafts'} className="pb-8">
        <TabsList variant="line">
          {canChat && <TabsTrigger value="vera">Vera</TabsTrigger>}
          <TabsTrigger value="vera-posts">
            Vera&apos;s posts
            {veraDrafts.length > 0 && (
              <span className="text-xs text-muted-foreground">{veraDrafts.length}</span>
            )}
          </TabsTrigger>
          <TabsTrigger value="drafts">Drafts</TabsTrigger>
          <TabsTrigger value="templates">Templates</TabsTrigger>
        </TabsList>
        {canChat && (
          <TabsContent value="vera" className="pt-4">
            <StudioVeraPanel projectKey={projectKey} canCreateDraft={can('studio', 'create')} />
          </TabsContent>
        )}
        <TabsContent value="vera-posts" className="pt-4">
          <StudioVeraPosts
            drafts={veraDrafts}
            canSchedule={can('studio', 'edit')}
            onOpen={setOpenDraftId}
            onSchedule={setSchedulingDraft}
          />
        </TabsContent>
        <TabsContent value="drafts" className="pt-4">
          <StudioDraftList drafts={draftsQuery.data ?? []} onOpen={setOpenDraftId} />
        </TabsContent>
        <TabsContent value="templates" className="space-y-8 pt-4">
          <section className="space-y-3">
            <h2 className="text-sm font-medium">Templates</h2>
            <StudioTemplateGrid
              projectKey={projectKey}
              templates={templatesQuery.data ?? []}
              canEdit={can('studio', 'edit')}
            />
          </section>
          <section className="space-y-3">
            <h2 className="text-sm font-medium">Images</h2>
            <StudioPostGrid
              projectKey={projectKey}
              posts={postsQuery.data ?? []}
              canDelete={can('studio', 'delete')}
            />
          </section>
        </TabsContent>
      </Tabs>
      <StudioDraftDialog
        projectKey={projectKey}
        draftId={openDraftId}
        canEdit={can('studio', 'edit')}
        onClose={() => setOpenDraftId(null)}
      />
      <StudioScheduleDialog
        projectKey={projectKey}
        draft={schedulingDraft}
        onClose={() => setSchedulingDraft(null)}
      />
    </SectionPageView>
  );
}
