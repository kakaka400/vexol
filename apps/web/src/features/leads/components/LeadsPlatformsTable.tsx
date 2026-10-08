import { ChevronRight, Download } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { usePermissions } from '@/hooks/usePermissions';
import type { LeadPlatform } from '@/lib/api';
import { downloadCsv } from '@/utils/csv';
import { useImportLeadPlatforms } from '../services/leads.service';
import { csvDate, formatLeadDate, platformsCsv } from '../utils/leads';
import LeadsCsvImportButton from './LeadsCsvImportButton';
import LeadsSection from './LeadsSection';

export default function LeadsPlatformsTable({
  projectKey,
  platforms,
  onOpen,
}: {
  projectKey: string;
  platforms: LeadPlatform[];
  onOpen: (slug: string) => void;
}) {
  const { can } = usePermissions();
  const importPlatforms = useImportLeadPlatforms(projectKey);

  return (
    <LeadsSection
      title="Platforms"
      description="Each platform has its own agent, leads and scrape logs."
      actions={
        <>
          {can('leads', 'create') && (
            <LeadsCsvImportButton onImport={(csv) => importPlatforms.mutate(csv)} />
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => downloadCsv(`lead-platforms-${csvDate()}.csv`, platformsCsv(platforms))}
          >
            <Download />
            Export CSV
          </Button>
        </>
      }
    >
      <div className="overflow-hidden rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Platform</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Agent</TableHead>
              <TableHead className="text-right">Leads</TableHead>
              <TableHead className="text-right">Scrapes</TableHead>
              <TableHead>Last scrape</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {platforms.map((platform) => (
              <TableRow
                key={platform.id}
                className="cursor-pointer"
                onClick={() => onOpen(platform.slug)}
              >
                <TableCell className="font-medium">{platform.name}</TableCell>
                <TableCell>
                  <Badge variant={platform.active ? 'secondary' : 'outline'}>
                    {platform.active ? 'Active' : 'Inactive'}
                  </Badge>
                  {platform.openRunCount > 0 && (
                    <span className="ml-2 text-xs text-muted-foreground">
                      {platform.openRunCount} running
                    </span>
                  )}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {platform.agent ? `@${platform.agent.username}` : 'No agent'}
                </TableCell>
                <TableCell className="text-right tabular-nums">{platform.leadCount}</TableCell>
                <TableCell className="text-right tabular-nums">{platform.runCount}</TableCell>
                <TableCell className="text-muted-foreground">
                  {formatLeadDate(platform.lastRunAt)}
                </TableCell>
                <TableCell>
                  <ChevronRight className="size-4 text-muted-foreground" />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </LeadsSection>
  );
}
