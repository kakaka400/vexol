import { ExternalLink, NotebookText } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import type { TwitterItem } from '@/lib/api';
import { useTwitter } from '../context/TwitterContext';
import { formatDate, metricLabel, obsidianLink, safeHref } from '../utils/twitter';
import TwitterBadge from './TwitterBadge';

const VERIFICATION_TONE = { verified: 'good', unverified: 'muted', disputed: 'bad' } as const;
const NOTE_LABEL = { written: 'in Obsidian', failed: 'not saved', pending: 'saving' } as const;

// One public post as it was fetched. The text is rendered as plain text: it is
// written by strangers and never interpreted as markup.
export default function TwitterItemCard({
  item,
  selected,
  onSelect,
  onShowChain,
}: {
  item: TwitterItem;
  selected?: boolean;
  onSelect?: (selected: boolean) => void;
  onShowChain?: () => void;
}) {
  const { vaultName } = useTwitter();
  const note = obsidianLink(vaultName, item.obsidianPath);
  const metrics = Object.entries(item.metrics ?? {});
  const noteState = item.obsidianStatus ?? 'pending';
  return (
    <li className="flex gap-3 py-4">
      {onSelect && (
        <Checkbox
          checked={selected}
          onCheckedChange={(checked) => onSelect(checked === true)}
          aria-label={`Select the post by @${item.authorHandle}`}
          className="mt-1"
        />
      )}
      <div className="min-w-0 flex-1 space-y-2">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
          <a
            href={safeHref(item.profileUrl) ?? '#'}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium hover:underline"
          >
            @{item.authorHandle}
          </a>
          {item.authorName && <span className="text-muted-foreground">{item.authorName}</span>}
          <span className="text-xs text-muted-foreground">{formatDate(item.publishedAt)}</span>
          {item.language && (
            <span className="text-xs text-muted-foreground uppercase">{item.language}</span>
          )}
        </div>
        <p className="text-sm break-words whitespace-pre-wrap">{item.text}</p>
        {metrics.length > 0 && (
          <p className="text-xs text-muted-foreground">
            {metrics.map(([key, value]) => `${value} ${metricLabel(key)}`).join(' · ')} on{' '}
            {formatDate(item.fetchedAt)}
          </p>
        )}
        {item.media.length > 0 && (
          <p className="text-xs text-muted-foreground">
            Media: {item.media.map((media) => media.type ?? 'media').join(', ')}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-1.5">
          <TwitterBadge tone={VERIFICATION_TONE[item.verificationStatus]}>
            {item.verificationStatus}
          </TwitterBadge>
          <TwitterBadge
            tone={item.sourceStatus === 'ok' ? 'good' : 'muted'}
            title={item.warnings.join(' ')}
          >
            {item.adapter} · {item.sourceStatus}
          </TwitterBadge>
          <TwitterBadge
            tone={noteState === 'written' ? 'good' : noteState === 'failed' ? 'bad' : 'muted'}
          >
            {NOTE_LABEL[noteState]}
          </TwitterBadge>
          {item.runIds.length > 1 && (
            <TwitterBadge>found in {item.runIds.length} runs</TwitterBadge>
          )}
          {item.draftIds.length > 0 && (
            <TwitterBadge tone="good">used in {item.draftIds.length} drafts</TwitterBadge>
          )}
          {item.tags.map((tag) => (
            <TwitterBadge key={tag}>#{tag}</TwitterBadge>
          ))}
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          {item.query && <span>Found by: {item.query}</span>}
          <span>Fetched {formatDate(item.fetchedAt)}</span>
          <a
            href={safeHref(item.canonicalUrl) ?? '#'}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 hover:text-foreground"
          >
            <ExternalLink className="size-3" /> {item.postId ? `Post ${item.postId}` : 'Source'}
          </a>
          {note && (
            <a href={note} className="inline-flex items-center gap-1 hover:text-foreground">
              <NotebookText className="size-3" /> Open in Obsidian
            </a>
          )}
          {onShowChain && (
            <button type="button" onClick={onShowChain} className="hover:text-foreground">
              Source chain
            </button>
          )}
        </div>
      </div>
    </li>
  );
}
