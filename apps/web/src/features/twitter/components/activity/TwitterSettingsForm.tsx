'use client';

import { Skeleton } from '@/components/ui/skeleton';
import { useTwitter } from '../../context/TwitterContext';
import { useTwitterSettingsQuery } from '../../services/twitter.service';
import TwitterSettingsFields from './TwitterSettingsFields';

// Remounts the fields when the saved settings change, so they start from them.
export default function TwitterSettingsForm() {
  const { projectKey, canEdit } = useTwitter();
  const settings = useTwitterSettingsQuery(projectKey);
  if (!settings.data) return <Skeleton className="h-64" />;
  return (
    <TwitterSettingsFields
      key={JSON.stringify(settings.data)}
      initial={settings.data}
      disabled={!canEdit}
    />
  );
}
