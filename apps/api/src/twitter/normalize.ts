import { createHash } from 'node:crypto';
import { profileUrl } from './urls';

// The one shape every research source is reduced to before it is stored. What a
// source did not return stays null; nothing is filled in by guessing.

export type VerificationStatus = 'unverified' | 'verified' | 'disputed';
export type SourceStatus = 'ok' | 'partial' | 'unavailable';

export interface MediaInfo {
  type: string;
  url: string | null;
  altText: string | null;
}

export interface NormalizedItem {
  postId: string | null;
  canonicalUrl: string;
  authorHandle: string;
  authorName: string | null;
  profileUrl: string;
  text: string;
  publishedAt: Date | null;
  fetchedAt: Date;
  language: string | null;
  metrics: Record<string, number> | null;
  media: MediaInfo[];
  links: string[];
  adapter: string;
  sourceStatus: SourceStatus;
  verificationStatus: VerificationStatus;
  warnings: string[];
  relevance: string | null;
}

export interface NormalizedProfile {
  handle: string;
  name: string | null;
  description: string | null;
  followers: number | null;
  profileUrl: string;
  fetchedAt: Date;
}

export const MAX_TEXT = 10_000;

export function cleanText(text: string): string {
  const withoutControls = [...text.normalize('NFC').replace(/\r\n?/g, '\n')]
    .filter((char) => {
      const code = char.charCodeAt(0);
      return code === 9 || code === 10 || (code >= 32 && code !== 127);
    })
    .join('');
  return withoutControls.trim().slice(0, MAX_TEXT);
}

// The third dedup key, for items without a post id or a stable URL: the author
// plus the text with whitespace collapsed.
export function contentHash(authorHandle: string, text: string): string {
  const normalized = cleanText(text).replace(/\s+/g, ' ').toLowerCase();
  return createHash('sha256').update(`${authorHandle.toLowerCase()}\n${normalized}`).digest('hex');
}

export function item(
  input: Omit<NormalizedItem, 'profileUrl' | 'text' | 'warnings' | 'relevance'> & {
    text: string;
    warnings?: string[];
    relevance?: string | null;
  },
): NormalizedItem {
  return {
    ...input,
    authorHandle: input.authorHandle.toLowerCase(),
    profileUrl: profileUrl(input.authorHandle.toLowerCase()),
    text: cleanText(input.text),
    warnings: input.warnings ?? [],
    relevance: input.relevance ?? null,
  };
}

const finiteMetrics = (metrics: Record<string, number> | null) =>
  metrics &&
  Object.fromEntries(
    Object.entries(metrics).filter(([, value]) => Number.isFinite(value) && value >= 0),
  );

export interface StoredItemState {
  postId: string | null;
  authorName: string | null;
  text: string;
  publishedAt: Date | null;
  fetchedAt: Date;
  language: string | null;
  metrics: Record<string, number> | null;
  media: MediaInfo[] | Array<Record<string, unknown>>;
  links: string[];
}

// What a newer reading of an already stored post may change. Metrics are replaced
// only by a reading taken later; empty fields are filled; the text is replaced
// only by a longer text that starts with the stored one (a truncated copy that is
// now complete). Returns null when the new reading adds nothing.
export function mergeUpdate(
  stored: StoredItemState,
  incoming: NormalizedItem,
): Partial<StoredItemState> | null {
  const patch: Partial<StoredItemState> = {};
  const newer = incoming.fetchedAt.getTime() > stored.fetchedAt.getTime();
  const metrics = finiteMetrics(incoming.metrics);
  if (newer && metrics && Object.keys(metrics).length > 0) {
    if (JSON.stringify(metrics) !== JSON.stringify(stored.metrics)) patch.metrics = metrics;
  }
  if (!stored.postId && incoming.postId) patch.postId = incoming.postId;
  if (!stored.authorName && incoming.authorName) patch.authorName = incoming.authorName;
  if (!stored.publishedAt && incoming.publishedAt) patch.publishedAt = incoming.publishedAt;
  if (!stored.language && incoming.language) patch.language = incoming.language;
  if (stored.media.length === 0 && incoming.media.length > 0) patch.media = incoming.media;
  if (stored.links.length === 0 && incoming.links.length > 0) patch.links = incoming.links;
  const storedText = stored.text.replace(/…$/, '');
  if (incoming.text.length > stored.text.length && incoming.text.startsWith(storedText)) {
    patch.text = incoming.text;
  }
  if (Object.keys(patch).length === 0) return null;
  if (newer) patch.fetchedAt = incoming.fetchedAt;
  return patch;
}
