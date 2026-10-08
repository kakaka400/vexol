import { Skeleton } from '@/components/ui/skeleton';
import type { LeadPlatform } from '@/lib/api';
import { useScrapeRunsQuery, useScrapedLeadsQuery } from '../services/leads.service';
import LeadsErrorState from './LeadsErrorState';
import LeadsPlatformsTable from './LeadsPlatformsTable';
import LeadsRunsTable from './LeadsRunsTable';
import LeadsSection from './LeadsSection';
import LeadsStatCards from './LeadsStatCards';
import LeadsTable from './LeadsTable';

// The leads and scrape logs of every platform together.
export default function LeadsGeneralDashboard({
  projectKey,
  platforms,
  onOpen,
}: {
  projectKey: string;
  platforms: LeadPlatform[];
  onOpen: (slug: string) => void;
}) {
  const leadsQuery = useScrapedLeadsQuery(projectKey);
  const runsQuery = useScrapeRunsQuery(projectKey);

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
      <LeadsStatCards leads={leads} runs={runs} />
      <LeadsPlatformsTable projectKey={projectKey} platforms={platforms} onOpen={onOpen} />
      <LeadsSection
        title="All leads"
        description={`${leads.length} lead(s) from every platform, grouped by sector.`}
      >
        <LeadsTable
          projectKey={projectKey}
          leads={leads}
          fileName="leads"
          importTargets={platforms.map((platform) => ({ id: platform.id, label: platform.name }))}
          view="mixed"
        />
      </LeadsSection>
      <LeadsRunsTable
        projectKey={projectKey}
        runs={runs}
        leads={leads}
        fileName="all"
        showPlatform
      />
    </>
  );
}
