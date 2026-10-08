import { Skeleton } from '@/components/ui/skeleton';
import type { TwitterStatus } from '@/lib/api';
import TwitterActivityList from './TwitterActivityList';
import TwitterConnections from './TwitterConnections';
import TwitterSettingsForm from './TwitterSettingsForm';

export default function TwitterActivityTab({ status }: { status: TwitterStatus | null }) {
  return (
    <div className="grid gap-10 xl:grid-cols-[minmax(0,1fr)_minmax(0,420px)]">
      <TwitterActivityList />
      <div className="space-y-10">
        {status ? <TwitterConnections status={status} /> : <Skeleton className="h-48" />}
        <TwitterSettingsForm />
      </div>
    </div>
  );
}
