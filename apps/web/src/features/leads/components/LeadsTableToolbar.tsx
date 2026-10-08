import { Download, Search, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { ScrapedLead } from '@/lib/api';
import { ALL_SECTORS, groupBySector } from '../utils/leads';
import LeadsCsvImportButton from './LeadsCsvImportButton';

export default function LeadsTableToolbar({
  leads,
  search,
  onSearch,
  sector,
  onSector,
  selectedCount,
  canDelete,
  onDelete,
  onExportSelected,
  onExportAll,
  importTargets,
  onImport,
}: {
  leads: ScrapedLead[];
  search: string;
  onSearch: (value: string) => void;
  sector: string;
  onSector: (value: string) => void;
  selectedCount: number;
  canDelete: boolean;
  onDelete: () => void;
  onExportSelected: () => void;
  onExportAll: () => void;
  importTargets: { id: string; label: string }[];
  onImport: (csv: string, platformId?: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative w-full sm:w-64">
        <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(event) => onSearch(event.target.value)}
          placeholder="Search company or email"
          className="pl-8"
        />
      </div>
      <Select value={sector} onValueChange={onSector}>
        <SelectTrigger className="w-full sm:w-56" aria-label="Sector">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL_SECTORS}>All sectors ({leads.length})</SelectItem>
          {groupBySector(leads).map(([name, rows]) => (
            <SelectItem key={name} value={name}>
              {name} ({rows.length})
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <div className="ml-auto flex flex-wrap items-center gap-2">
        {selectedCount > 0 ? (
          <>
            <span className="text-sm text-muted-foreground tabular-nums">
              {selectedCount} selected
            </span>
            <Button variant="outline" size="sm" onClick={onExportSelected}>
              <Download />
              Export selected
            </Button>
            {canDelete && (
              <Button variant="destructive" size="sm" onClick={onDelete}>
                <Trash2 />
                Delete
              </Button>
            )}
          </>
        ) : (
          <>
            {importTargets.length > 0 && (
              <LeadsCsvImportButton
                targets={importTargets.length > 1 ? importTargets : undefined}
                onImport={(csv, platformId) => onImport(csv, platformId ?? importTargets[0].id)}
              />
            )}
            <Button variant="outline" size="sm" onClick={onExportAll} disabled={leads.length === 0}>
              <Download />
              Export CSV
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
