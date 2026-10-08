import { useState } from 'react';
import { Download } from 'lucide-react';
import { EmptyState } from '@/components/common/page/EmptyState';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { usePermissions } from '@/hooks/usePermissions';
import type { ScrapeRun, ScrapedLead } from '@/lib/api';
import { downloadCsv } from '@/utils/csv';
import { useImportScrapeRuns } from '../services/leads.service';
import { csvDate, leadsCsv, runsCsv } from '../utils/leads';
import LeadsCsvImportButton from './LeadsCsvImportButton';
import LeadsRunDeleteDialog from './LeadsRunDeleteDialog';
import LeadsRunRow from './LeadsRunRow';
import LeadsSection from './LeadsSection';

export default function LeadsRunsTable({
  projectKey,
  runs,
  leads,
  fileName,
  showPlatform,
}: {
  projectKey: string;
  runs: ScrapeRun[];
  leads: ScrapedLead[];
  fileName: string;
  showPlatform: boolean;
}) {
  const { can } = usePermissions();
  const [deleting, setDeleting] = useState<ScrapeRun | null>(null);
  const importRuns = useImportScrapeRuns(projectKey);

  const runLeads = (run: ScrapeRun) => leads.filter((lead) => lead.scrapeRunId === run.id);

  return (
    <LeadsSection
      title="Scrape logs"
      description="Every scrape with its input, status and the number of leads found."
      actions={
        <>
          {can('leads', 'create') && (
            <LeadsCsvImportButton onImport={(csv) => importRuns.mutate(csv)} />
          )}
          <Button
            variant="outline"
            size="sm"
            disabled={runs.length === 0}
            onClick={() => downloadCsv(`${fileName}-scrape-logs-${csvDate()}.csv`, runsCsv(runs))}
          >
            <Download />
            Export CSV
          </Button>
        </>
      }
    >
      {runs.length === 0 ? (
        <div className="flex min-h-40 rounded-lg border border-dashed">
          <EmptyState
            title="No scrapes yet"
            description="Each started scrape is logged here with its region, niche and size."
          />
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Started</TableHead>
                {showPlatform && <TableHead>Platform</TableHead>}
                <TableHead>Region</TableHead>
                <TableHead>Niche</TableHead>
                <TableHead>Size</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Leads</TableHead>
                <TableHead className="w-24" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {runs.map((run) => (
                <LeadsRunRow
                  key={run.id}
                  run={run}
                  showPlatform={showPlatform}
                  canDelete={can('leads', 'delete')}
                  onDownload={() =>
                    downloadCsv(
                      `${run.platformSlug}-${run.createdAt.slice(0, 10)}-leads.csv`,
                      leadsCsv(runLeads(run), run.leadFormat),
                    )
                  }
                  onDelete={() => setDeleting(run)}
                />
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      {deleting && (
        <LeadsRunDeleteDialog
          projectKey={projectKey}
          run={deleting}
          leadCount={runLeads(deleting).length}
          onClose={() => setDeleting(null)}
        />
      )}
    </LeadsSection>
  );
}
