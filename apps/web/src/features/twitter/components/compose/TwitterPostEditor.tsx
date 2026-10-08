'use client';

import { ArrowDown, ArrowUp, Plus, Scissors, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { useTwitter } from '../../context/TwitterContext';
import { useSplitTwitterThread } from '../../services/twitter.service';
import { TWITTER_MAX_LENGTH, weightedLength } from '../../utils/twitter';

const MAX_POSTS = 25;

// The posts of a draft in thread order, each with its X character count.
export default function TwitterPostEditor({
  posts,
  onChange,
  disabled,
}: {
  posts: string[];
  onChange: (posts: string[]) => void;
  disabled: boolean;
}) {
  const { projectKey } = useTwitter();
  const split = useSplitTwitterThread(projectKey);
  const update = (index: number, text: string) =>
    onChange(posts.map((post, i) => (i === index ? text : post)));
  const move = (index: number, by: number) => {
    const next = [...posts];
    [next[index], next[index + by]] = [next[index + by]!, next[index]!];
    onChange(next);
  };

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-medium">
          {posts.length > 1 ? `Thread · ${posts.length} posts` : 'Post'}
        </h3>
        {!disabled && (
          <Button
            size="sm"
            variant="ghost"
            disabled={split.isPending || posts.join('').trim().length === 0}
            onClick={() =>
              split.mutate(posts.join('\n\n'), { onSuccess: (result) => onChange(result.posts) })
            }
          >
            <Scissors className="size-3.5" /> Split into thread
          </Button>
        )}
      </div>
      <ol className="space-y-3">
        {posts.map((post, index) => {
          const length = weightedLength(post);
          return (
            <li key={index} className="space-y-1">
              <Textarea
                aria-label={`Post ${index + 1}`}
                rows={3}
                value={post}
                disabled={disabled}
                onChange={(e) => update(index, e.target.value)}
              />
              <div className="flex items-center justify-between text-xs">
                <span
                  className={cn(
                    'tabular-nums',
                    length > TWITTER_MAX_LENGTH ? 'text-destructive' : 'text-muted-foreground',
                  )}
                >
                  {length} / {TWITTER_MAX_LENGTH}
                </span>
                {!disabled && posts.length > 1 && (
                  <span className="flex gap-1">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="size-7"
                      disabled={index === 0}
                      onClick={() => move(index, -1)}
                      aria-label="Move up"
                    >
                      <ArrowUp className="size-3.5" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="size-7"
                      disabled={index === posts.length - 1}
                      onClick={() => move(index, 1)}
                      aria-label="Move down"
                    >
                      <ArrowDown className="size-3.5" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="size-7"
                      onClick={() => onChange(posts.filter((_, i) => i !== index))}
                      aria-label="Remove post"
                    >
                      <X className="size-3.5" />
                    </Button>
                  </span>
                )}
              </div>
            </li>
          );
        })}
      </ol>
      {!disabled && posts.length < MAX_POSTS && (
        <Button size="sm" variant="ghost" onClick={() => onChange([...posts, ''])}>
          <Plus className="size-3.5" /> Add a post to the thread
        </Button>
      )}
    </section>
  );
}
