import type { StudioDraftDetail } from '@/lib/api';
import { formatDateTime } from '@/utils/dates';

export default function StudioDraftHistory({
  versions,
}: {
  versions: StudioDraftDetail['versions'];
}) {
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-medium">History</h3>
      <ol className="space-y-2">
        {[...versions].reverse().map((item) => (
          <li key={item.version} className="rounded-md border px-3 py-2 text-xs">
            <div className="flex flex-wrap justify-between gap-2">
              <span className="font-medium">Version {item.version}</span>
              <span className="text-muted-foreground">
                {item.createdByName ?? 'Unknown'} · {formatDateTime(item.createdAt)}
              </span>
            </div>
            {item.review && (
              <p className="mt-1">
                {item.review.decision === 'approved' ? 'Approved' : 'Rejected'} by{' '}
                {item.review.decidedByName ?? 'unknown'} on {formatDateTime(item.review.decidedAt)}
                {item.review.reason && `: ${item.review.reason}`}
              </p>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}
