'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useShell } from '@/context/shellContext';
import { usePermissions } from '@/hooks/usePermissions';
import SectionPageView from '@/components/common/page/SectionPageView';
import { Skeleton } from '@/components/ui/skeleton';
import LeadsAddPlatformButton from './components/LeadsAddPlatformButton';
import LeadsErrorState from './components/LeadsErrorState';
import LeadsGeneralDashboard from './components/LeadsGeneralDashboard';
import LeadsPlatformDashboard from './components/LeadsPlatformDashboard';
import LeadsPlatformTabs from './components/LeadsPlatformTabs';
import { useLeadPlatformsQuery } from './services/leads.service';
import { GENERAL_TAB } from './utils/leads';

export default function LeadsPage() {
  const { project } = useShell();
  const { can } = usePermissions();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const projectKey = project?.project.key ?? '';
  const platformsQuery = useLeadPlatformsQuery(projectKey);

  if (!project || platformsQuery.isLoading) return <Skeleton className="m-6 flex-1" />;
  if (!can('leads', 'read')) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        You do not have access to Leads.
      </div>
    );
  }
  if (platformsQuery.isError) {
    return (
      <LeadsErrorState error={platformsQuery.error} onRetry={() => void platformsQuery.refetch()} />
    );
  }

  const platforms = platformsQuery.data ?? [];
  const platform = platforms.find((p) => p.slug === searchParams.get('platform')) ?? null;
  const select = (slug: string) =>
    router.replace(slug === GENERAL_TAB ? pathname : `${pathname}?platform=${slug}`);

  return (
    <SectionPageView
      title="Leads"
      description="Leads found by the scraper agents. Each platform has its own agent, leads and scrape logs."
      actions={
        can('ai_agents', 'create') && (
          <LeadsAddPlatformButton projectKey={projectKey} onCreated={select} />
        )
      }
      wide
    >
      <LeadsPlatformTabs
        platforms={platforms}
        selected={platform?.slug ?? GENERAL_TAB}
        onSelect={select}
      />
      <div className="space-y-8 pt-6 pb-8">
        {platform ? (
          <LeadsPlatformDashboard
            key={platform.id}
            projectKey={projectKey}
            platform={platform}
            onDeleted={() => select(GENERAL_TAB)}
          />
        ) : (
          <LeadsGeneralDashboard projectKey={projectKey} platforms={platforms} onOpen={select} />
        )}
      </div>
    </SectionPageView>
  );
}
