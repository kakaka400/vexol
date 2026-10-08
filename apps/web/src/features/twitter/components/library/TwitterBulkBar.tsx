'use client';

import { useState } from 'react';
import { PenLine, Tag } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { TwitterVerification } from '@/lib/api';
import { useTwitter } from '../../context/TwitterContext';
import { useUpdateTwitterItems } from '../../services/twitter.service';
import { splitList } from '../../utils/twitter';

// Actions on the selected library items: tag, change verification, or take them
// to the composer as context.
export default function TwitterBulkBar({
  selected,
  total,
  onSelectAll,
  onClear,
  onUseAsContext,
}: {
  selected: Set<string>;
  total: number;
  onSelectAll: () => void;
  onClear: () => void;
  onUseAsContext: () => void;
}) {
  const { projectKey, canEdit } = useTwitter();
  const update = useUpdateTwitterItems(projectKey);
  const [tags, setTags] = useState('');
  const ids = [...selected];
  const none = ids.length === 0;

  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <span className="text-muted-foreground">
        {ids.length} of {total} selected
      </span>
      <Button size="sm" variant="ghost" onClick={none ? onSelectAll : onClear}>
        {none ? 'Select all' : 'Clear'}
      </Button>
      {canEdit && (
        <>
          <Input
            className="h-8 w-44"
            placeholder="tag, another"
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            aria-label="Tags to add or remove"
          />
          <Button
            size="sm"
            variant="outline"
            disabled={none || !tags.trim() || update.isPending}
            onClick={() =>
              update.mutate({ ids, addTags: splitList(tags) }, { onSuccess: () => setTags('') })
            }
          >
            <Tag className="size-3.5" /> Add tags
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={none || !tags.trim() || update.isPending}
            onClick={() =>
              update.mutate({ ids, removeTags: splitList(tags) }, { onSuccess: () => setTags('') })
            }
          >
            Remove tags
          </Button>
          <Select
            value=""
            disabled={none}
            onValueChange={(value) =>
              update.mutate({ ids, verificationStatus: value as TwitterVerification })
            }
          >
            <SelectTrigger size="sm" className="w-40" aria-label="Set verification">
              <SelectValue placeholder="Set verification" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="verified">Verified</SelectItem>
              <SelectItem value="unverified">Unverified</SelectItem>
              <SelectItem value="disputed">Disputed</SelectItem>
            </SelectContent>
          </Select>
        </>
      )}
      <Button
        size="sm"
        variant="outline"
        disabled={none}
        onClick={onUseAsContext}
        className="ml-auto"
      >
        <PenLine className="size-3.5" /> Use as context for a post
      </Button>
    </div>
  );
}
