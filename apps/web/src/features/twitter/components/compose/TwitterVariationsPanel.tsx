'use client';

import { Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useTwitter } from '../../context/TwitterContext';
import { useTwitterVariations } from '../../services/twitter.service';
import { TWITTER_MAX_LENGTH } from '../../utils/twitter';

// Alternative versions of the first post, written by the project's OpenRouter
// model from the linked sources. Nothing is saved until one is used and saved.
export default function TwitterVariationsPanel({
  text,
  tone,
  sourceIds,
  onUse,
}: {
  text: string;
  tone: string;
  sourceIds: string[];
  onUse: (text: string) => void;
}) {
  const { projectKey } = useTwitter();
  const variations = useTwitterVariations(projectKey);
  return (
    <section className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-medium">Variations</h3>
        <Button
          size="sm"
          variant="ghost"
          disabled={!text.trim() || variations.isPending}
          onClick={() =>
            variations.mutate({ text, tone: tone.trim() || undefined, sourceItemIds: sourceIds })
          }
        >
          <Sparkles className="size-3.5" /> {variations.isPending ? 'Writing…' : 'Write variations'}
        </Button>
      </div>
      {variations.isError && <p className="text-sm text-destructive">{variations.error.message}</p>}
      <ul className="space-y-2">
        {(variations.data?.variations ?? []).map((variation) => (
          <li
            key={variation.index + variation.text}
            className="flex gap-2 rounded-md bg-muted/40 p-3 text-sm"
          >
            <p className="min-w-0 flex-1 break-words whitespace-pre-wrap">{variation.text}</p>
            <div className="flex shrink-0 flex-col items-end gap-1">
              <span
                className={cn(
                  'text-xs tabular-nums',
                  variation.overLimit ? 'text-destructive' : 'text-muted-foreground',
                )}
              >
                {variation.length}/{TWITTER_MAX_LENGTH}
              </span>
              <Button size="sm" variant="outline" onClick={() => onUse(variation.text)}>
                Use
              </Button>
            </div>
          </li>
        ))}
      </ul>
      {variations.data && (
        <p className="text-xs text-muted-foreground">
          Check every fact and number in a variation against its sources.
        </p>
      )}
    </section>
  );
}
