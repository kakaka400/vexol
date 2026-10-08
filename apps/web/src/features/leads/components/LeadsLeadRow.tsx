import { ExternalLink } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { TableCell, TableRow } from '@/components/ui/table';
import type { ScrapedLead } from '@/lib/api';
import { formatFollowers, formatLeadDate, type LeadView } from '../utils/leads';
import LeadsLeadAccount from './LeadsLeadAccount';

export default function LeadsLeadRow({
  lead,
  view,
  selected,
  onToggle,
}: {
  lead: ScrapedLead;
  view: LeadView;
  selected: boolean;
  onToggle: (on: boolean) => void;
}) {
  return (
    <TableRow data-state={selected ? 'selected' : undefined}>
      <TableCell className="align-top">
        <Checkbox
          checked={selected}
          onCheckedChange={(checked) => onToggle(checked === true)}
          aria-label={`Select ${lead.handle ?? lead.name}`}
        />
      </TableCell>
      {view === 'email' && (
        <>
          <TableCell className="font-medium">{lead.name}</TableCell>
          <TableCell>
            <a href={`mailto:${lead.email}`} className="text-muted-foreground hover:underline">
              {lead.email}
            </a>
          </TableCell>
          <TableCell className="text-right text-muted-foreground tabular-nums">
            {formatLeadDate(lead.createdAt)}
          </TableCell>
        </>
      )}
      {view === 'social' && (
        <>
          <TableCell className="align-top">
            <LeadsLeadAccount lead={lead} />
          </TableCell>
          <TableCell className="text-right align-top tabular-nums">
            {formatFollowers(lead.followers)}
          </TableCell>
          <TableCell className="max-w-md align-top">
            <p className="line-clamp-3 text-sm whitespace-normal" title={lead.comment ?? undefined}>
              {lead.comment ?? '—'}
            </p>
          </TableCell>
          <TableCell className="align-top whitespace-nowrap text-muted-foreground tabular-nums">
            {formatLeadDate(lead.commentedAt)}
          </TableCell>
          <TableCell className="align-top">
            {lead.videoUrl ? (
              <a
                href={lead.videoUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
                aria-label="Open video"
              >
                <ExternalLink className="size-4" />
              </a>
            ) : (
              <span className="text-muted-foreground">—</span>
            )}
          </TableCell>
        </>
      )}
      {view === 'mixed' && (
        <>
          <TableCell className="font-medium">
            {lead.handle ? `@${lead.handle}` : lead.name}
          </TableCell>
          <TableCell>
            {lead.email ? (
              <a href={`mailto:${lead.email}`} className="text-muted-foreground hover:underline">
                {lead.email}
              </a>
            ) : lead.profileUrl ? (
              <a
                href={lead.profileUrl}
                target="_blank"
                rel="noreferrer"
                className="text-muted-foreground hover:underline"
              >
                Profile
              </a>
            ) : (
              <span className="text-muted-foreground">—</span>
            )}
          </TableCell>
          <TableCell className="text-muted-foreground">{lead.platformName}</TableCell>
          <TableCell className="text-right text-muted-foreground tabular-nums">
            {formatLeadDate(lead.createdAt)}
          </TableCell>
        </>
      )}
    </TableRow>
  );
}
