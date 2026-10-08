import { useMemo, useState } from 'react';
import ConfirmDialog from '@/components/common/overlay/ConfirmDialog';
import { EmptyState } from '@/components/common/page/EmptyState';
import { Checkbox } from '@/components/ui/checkbox';
import { Table, TableBody, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { usePermissions } from '@/hooks/usePermissions';
import type { ScrapedLead } from '@/lib/api';
import { downloadCsv } from '@/utils/csv';
import { useDeleteScrapedLeads, useImportScrapedLeads } from '../services/leads.service';
import {
  ALL_SECTORS,
  NO_SECTOR,
  csvDate,
  groupBySector,
  leadsCsv,
  LEAD_COLUMNS,
  type LeadView,
} from '../utils/leads';
import LeadsTableGroup from './LeadsTableGroup';
import LeadsTableToolbar from './LeadsTableToolbar';

export default function LeadsTable({
  projectKey,
  leads,
  fileName,
  importTargets,
  view,
}: {
  projectKey: string;
  leads: ScrapedLead[];
  fileName: string;
  importTargets: { id: string; label: string }[];
  view: LeadView;
}) {
  const { can } = usePermissions();
  const [search, setSearch] = useState('');
  const [sector, setSector] = useState(ALL_SECTORS);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmDelete, setConfirmDelete] = useState(false);
  const deleteLeads = useDeleteScrapedLeads(projectKey);
  const importLeads = useImportScrapedLeads(projectKey);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return leads.filter(
      (lead) =>
        (sector === ALL_SECTORS || (lead.sector ?? NO_SECTOR) === sector) &&
        (!query ||
          [lead.name, lead.email, lead.handle, lead.comment, lead.platformName].some((text) =>
            text?.toLowerCase().includes(query),
          )),
    );
  }, [leads, search, sector]);
  const groups = useMemo(() => groupBySector(filtered), [filtered]);
  const visibleSelected = filtered.filter((lead) => selected.has(lead.id));
  const allSelected = filtered.length > 0 && visibleSelected.length === filtered.length;

  const toggle = (ids: string[], on: boolean) =>
    setSelected((current) => {
      const next = new Set(current);
      for (const id of ids) {
        if (on) next.add(id);
        else next.delete(id);
      }
      return next;
    });

  return (
    <div className="space-y-3">
      <LeadsTableToolbar
        leads={leads}
        search={search}
        onSearch={setSearch}
        sector={sector}
        onSector={setSector}
        selectedCount={visibleSelected.length}
        canDelete={can('leads', 'delete')}
        onDelete={() => setConfirmDelete(true)}
        onExportSelected={() =>
          downloadCsv(`${fileName}-selected-${csvDate()}.csv`, leadsCsv(visibleSelected, view))
        }
        onExportAll={() => downloadCsv(`${fileName}-${csvDate()}.csv`, leadsCsv(filtered, view))}
        importTargets={can('leads', 'create') ? importTargets : []}
        onImport={(csv, platformId) => {
          if (platformId) importLeads.mutate({ platformId, csv });
        }}
      />
      {filtered.length === 0 ? (
        <div className="flex min-h-48 rounded-lg border border-dashed">
          <EmptyState
            title={leads.length === 0 ? 'No leads yet' : 'No matching leads'}
            description={
              leads.length === 0
                ? 'Leads appear here when an agent finishes a scrape, or after a CSV import.'
                : 'Change the search or the sector filter.'
            }
          />
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <Checkbox
                    checked={
                      allSelected ? true : visibleSelected.length > 0 ? 'indeterminate' : false
                    }
                    onCheckedChange={(checked) =>
                      toggle(
                        filtered.map((lead) => lead.id),
                        checked === true,
                      )
                    }
                    aria-label="Select all leads"
                  />
                </TableHead>
                {LEAD_COLUMNS[view].map((column) => (
                  <TableHead key={column} className={column === 'Followers' ? 'text-right' : ''}>
                    {column}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {groups.map(([name, rows]) => (
                <LeadsTableGroup
                  key={name}
                  sector={name}
                  leads={rows}
                  selected={selected}
                  onToggle={toggle}
                  view={view}
                />
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      {confirmDelete && (
        <ConfirmDialog
          title="Delete leads"
          confirmLabel={`Delete ${visibleSelected.length} lead(s)`}
          onClose={() => setConfirmDelete(false)}
          onConfirm={async () => {
            await deleteLeads.mutateAsync(visibleSelected.map((lead) => lead.id));
            toggle(
              visibleSelected.map((lead) => lead.id),
              false,
            );
            setConfirmDelete(false);
          }}
        >
          <p className="text-sm text-muted-foreground">
            The selected leads are deleted permanently. Export them first if you want to keep a
            copy.
          </p>
        </ConfirmDialog>
      )}
    </div>
  );
}
