import { Skeleton } from '@/components/ui/skeleton';
import type { LeadPlatform } from '@/lib/api';
import { useScrapeRunsQuery, useScrapedLeadsQuery } from '../services/leads.service';
import LeadsAgentCard from './LeadsAgentCard';
import LeadsErrorState from './LeadsErrorState';
import LeadsPlatformSettingsCard from './LeadsPlatformSettingsCard';
import LeadsRunsTable from './LeadsRunsTable';
import LeadsScrapeForm from './LeadsScrapeForm';
import LeadsSection from './LeadsSection';
import LeadsStatCards from './LeadsStatCards';
import LeadsTable from './LeadsTable';

export default function LeadsPlatformDashboard({
  projectKey,
  platform,
  onDeleted,
}: {
  projectKey: string;
  platform: LeadPlatform;
  onDeleted: () => void;
}) {
  const leadsQuery = useScrapedLeadsQuery(projectKey, platform.id);
  const runsQuery = useScrapeRunsQuery(projectKey, platform.id);

  if (leadsQuery.isLoading || runsQuery.isLoading) return <Skeleton className="h-96" />;
  if (leadsQuery.isError || runsQuery.isError) {
    return (
      <LeadsErrorState
        error={leadsQuery.error ?? runsQuery.error}
        onRetry={() => {
          void leadsQuery.refetch();
          void runsQuery.refetch();
        }}
      />
    );
  }

  const leads = leadsQuery.data ?? [];
  const runs = runsQuery.data ?? [];
  return (
    <>
      {!platform.active && (
        <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
          {platform.name} is not active yet. Its dashboard, agent and data are ready; turn the
          platform on and connect its agent to start scraping.
        </p>
      )}
      <LeadsStatCards leads={leads} runs={runs} />
      <LeadsScrapeForm projectKey={projectKey} platform={platform} />
      <LeadsSection
        title="Leads"
        description={`${leads.length} lead(s) from ${platform.name}, grouped by ${
          platform.leadFormat === 'social' ? 'topic' : 'sector'
        }.`}
      >
        <LeadsTable
          projectKey={projectKey}
          leads={leads}
          fileName={`leads-${platform.slug}`}
          importTargets={[{ id: platform.id, label: platform.name }]}
          view={platform.leadFormat}
        />
      </LeadsSection>
      <LeadsRunsTable
        projectKey={projectKey}
        runs={runs}
        leads={leads}
        fileName={platform.slug}
        showPlatform={false}
      />
      <div className="grid gap-4 lg:grid-cols-2">
        <LeadsAgentCard projectKey={projectKey} platform={platform} />
        <LeadsPlatformSettingsCard
          projectKey={projectKey}
          platform={platform}
          onDeleted={onDeleted}
        />
      </div>
    </>
  );
}
