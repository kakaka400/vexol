'use client';

import type { StudioDraft } from '@/lib/api';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatDateTime } from '@/utils/dates';
import StudioDraftStatusBadge from './StudioDraftStatusBadge';

export default function StudioDraftList({
  drafts,
  onOpen,
}: {
  drafts: StudioDraft[];
  onOpen: (draftId: string) => void;
}) {
  if (drafts.length === 0) {
    return (
      <div className="rounded-lg border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">
        No drafts yet. Save a reply from Vera to start one.
      </div>
    );
  }
  return (
    <div className="overflow-x-auto rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Caption</TableHead>
            <TableHead>Version</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Updated</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {drafts.map((draft) => (
            <TableRow key={draft.id} className="cursor-pointer" onClick={() => onOpen(draft.id)}>
              <TableCell className="max-w-md">
                <button type="button" className="line-clamp-2 text-left whitespace-normal">
                  {draft.caption}
                </button>
              </TableCell>
              <TableCell>v{draft.currentVersion}</TableCell>
              <TableCell>
                <StudioDraftStatusBadge status={draft.status} />
              </TableCell>
              <TableCell className="text-muted-foreground">
                {formatDateTime(draft.updatedAt)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
