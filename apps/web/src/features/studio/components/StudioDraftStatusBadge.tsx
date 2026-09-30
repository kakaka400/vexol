import { Badge } from '@/components/ui/badge';
import type { StudioDraftStatus } from '@/lib/api';

const LABELS: Record<StudioDraftStatus, string> = {
  draft: 'Draft',
  review_requested: 'In review',
  approved: 'Approved',
  rejected: 'Rejected',
  scheduled: 'Scheduled',
};

export default function StudioDraftStatusBadge({ status }: { status: StudioDraftStatus }) {
  return (
    <Badge
      variant={status === 'rejected' ? 'destructive' : status === 'draft' ? 'outline' : 'secondary'}
    >
      {LABELS[status]}
    </Badge>
  );
}
