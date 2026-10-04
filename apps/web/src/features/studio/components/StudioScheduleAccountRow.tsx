'use client';

import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { StudioPublishAccount, StudioPublishFormat } from '@/lib/api';
import { platformLabel } from '../utils/platforms';

// One Zernio account in the schedule form. Instagram also takes a format; a Reel
// is always a video, which Studio does not make, so it is listed but not offered.
export default function StudioScheduleAccountRow({
  account,
  hasImage,
  format,
  onChange,
}: {
  account: StudioPublishAccount;
  hasImage: boolean;
  format: StudioPublishFormat | null;
  onChange: (format: StudioPublishFormat | null) => void;
}) {
  const instagram = account.platform === 'instagram';
  const needsImage = instagram && !hasImage;
  const id = `studio-account-${account.id}`;

  return (
    <li className="flex flex-wrap items-center gap-3 p-3">
      <Checkbox
        id={id}
        checked={format != null}
        disabled={!account.connected || needsImage}
        onCheckedChange={(checked) => onChange(checked === true ? 'post' : null)}
      />
      <label htmlFor={id} className="min-w-0 flex-1 text-sm">
        <span className="font-medium">{platformLabel(account.platform)}</span>{' '}
        <span className="text-muted-foreground">@{account.username || account.displayName}</span>
        {!account.connected && (
          <span className="block text-xs text-muted-foreground">
            Reconnect this account in Zernio first.
          </span>
        )}
        {account.connected && needsImage && (
          <span className="block text-xs text-muted-foreground">
            Instagram needs an image; this draft has none.
          </span>
        )}
      </label>
      {instagram && format != null && (
        <Select value={format} onValueChange={(value) => onChange(value as StudioPublishFormat)}>
          <SelectTrigger className="w-40" aria-label="Instagram format">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="post">Post</SelectItem>
            <SelectItem value="story">Story</SelectItem>
            <SelectItem value="reel" disabled>
              Reel (needs a video)
            </SelectItem>
          </SelectContent>
        </Select>
      )}
    </li>
  );
}
