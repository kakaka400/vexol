'use client';

import { ExternalLink, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTwitter } from '../../context/TwitterContext';
import { useTwitterItemsQuery } from '../../services/twitter.service';
import { safeHref } from '../../utils/twitter';
import TwitterBadge from '../TwitterBadge';

// The research items a draft is written from. Their text is shown so the writer
// can check every claim against it.
export default function TwitterSourcesPanel({
  ids,
  onChange,
  disabled,
}: {
  ids: string[];
  onChange: (ids: string[]) => void;
  disabled: boolean;
}) {
  const { projectKey } = useTwitter();
  const items = useTwitterItemsQuery(projectKey, { ids: ids.join(',') }, ids.length > 0).data ?? [];
  return (
    <section className="space-y-2">
      <h3 className="text-sm font-medium">Sources ({ids.length})</h3>
      {ids.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No research linked. Select posts in the Library or a research run and choose “Use as
          context”.
        </p>
      )}
      <ul className="space-y-2">
        {items.map((item) => (
          <li key={item.id} className="flex gap-2 rounded-md bg-muted/40 p-3 text-sm">
            <div className="min-w-0 flex-1 space-y-1">
              <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                @{item.authorHandle}
                <TwitterBadge
                  tone={
                    item.verificationStatus === 'verified'
                      ? 'good'
                      : item.verificationStatus === 'disputed'
                        ? 'bad'
                        : 'muted'
                  }
                >
                  {item.verificationStatus}
                </TwitterBadge>
                <a
                  href={safeHref(item.canonicalUrl) ?? '#'}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 hover:text-foreground"
                >
                  <ExternalLink className="size-3" /> source
                </a>
              </p>
              <p className="line-clamp-4 break-words whitespace-pre-wrap">{item.text}</p>
            </div>
            {!disabled && (
              <Button
                size="icon"
                variant="ghost"
                className="size-7"
                aria-label="Remove source"
                onClick={() => onChange(ids.filter((id) => id !== item.id))}
              >
                <X className="size-3.5" />
              </Button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
