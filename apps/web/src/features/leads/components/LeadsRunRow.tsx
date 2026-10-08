import { Download, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { TableCell, TableRow } from '@/components/ui/table';
import type { ScrapeRun } from '@/lib/api';
import { RUN_STATUS_LABEL, formatLeadDate, runStatusVariant } from '../utils/leads';

export default function LeadsRunRow({
  run,
  showPlatform,
  canDelete,
  onDownload,
  onDelete,
}: {
  run: ScrapeRun;
  showPlatform: boolean;
  canDelete: boolean;
  onDownload: () => void;
  onDelete: () => void;
}) {
  return (
    <TableRow>
      <TableCell className="whitespace-nowrap tabular-nums">
        {formatLeadDate(run.createdAt)}
        {run.requestedBy && (
          <span className="block text-xs text-muted-foreground">{run.requestedBy}</span>
        )}
      </TableCell>
      {showPlatform && <TableCell>{run.platformName}</TableCell>}
      <TableCell className="max-w-48 truncate" title={run.region}>
        {run.region}
      </TableCell>
      <TableCell className="max-w-56" title={[run.niche, run.keywords].filter(Boolean).join(' · ')}>
        <span className="block truncate">{run.niche}</span>
        {run.keywords && (
          <span className="block truncate text-xs text-muted-foreground">{run.keywords}</span>
        )}
      </TableCell>
      <TableCell className="max-w-40 truncate" title={run.scale}>
        {run.scale}
      </TableCell>
      <TableCell>
        <Badge variant={runStatusVariant(run.status)} title={run.error ?? undefined}>
          {RUN_STATUS_LABEL[run.status]}
        </Badge>
        {run.error && (
          <span className="mt-1 block max-w-56 truncate text-xs text-destructive" title={run.error}>
            {run.error}
          </span>
        )}
      </TableCell>
      <TableCell className="text-right tabular-nums">{run.leadCount}</TableCell>
      <TableCell>
        <div className="flex justify-end gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            onClick={onDownload}
            aria-label="Download leads as CSV"
            title="Download leads as CSV"
          >
            <Download />
          </Button>
          {canDelete && (
            <Button
              variant="ghost"
              size="icon"
              className="size-8 text-muted-foreground hover:text-destructive"
              onClick={onDelete}
              aria-label="Delete scrape log"
              title="Delete scrape log"
            >
              <Trash2 />
            </Button>
          )}
        </div>
      </TableCell>
    </TableRow>
  );
}
