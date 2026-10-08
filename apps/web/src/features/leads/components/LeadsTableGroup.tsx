import { Checkbox } from '@/components/ui/checkbox';
import { TableCell, TableRow } from '@/components/ui/table';
import type { ScrapedLead } from '@/lib/api';
import { LEAD_COLUMNS, type LeadView } from '../utils/leads';
import LeadsLeadRow from './LeadsLeadRow';

// One sector: a header row that selects the whole sector, then its leads.
export default function LeadsTableGroup({
  sector,
  leads,
  selected,
  onToggle,
  view,
}: {
  sector: string;
  leads: ScrapedLead[];
  selected: Set<string>;
  onToggle: (ids: string[], on: boolean) => void;
  view: LeadView;
}) {
  const count = leads.filter((lead) => selected.has(lead.id)).length;
  const columns = LEAD_COLUMNS[view].length + 1;

  return (
    <>
      <TableRow className="bg-muted/40 hover:bg-muted/40">
        <TableCell>
          <Checkbox
            checked={count === leads.length ? true : count > 0 ? 'indeterminate' : false}
            onCheckedChange={(checked) =>
              onToggle(
                leads.map((lead) => lead.id),
                checked === true,
              )
            }
            aria-label={`Select all leads in ${sector}`}
          />
        </TableCell>
        <TableCell colSpan={columns - 1} className="text-xs font-medium text-muted-foreground">
          {sector} <span className="tabular-nums">· {leads.length}</span>
        </TableCell>
      </TableRow>
      {leads.map((lead) => (
        <LeadsLeadRow
          key={lead.id}
          lead={lead}
          view={view}
          selected={selected.has(lead.id)}
          onToggle={(on) => onToggle([lead.id], on)}
        />
      ))}
    </>
  );
}
