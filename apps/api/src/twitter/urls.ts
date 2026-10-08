import { HttpError } from '../shared/lib';

// Handles and URLs a person or an agent enters for research. Only public x.com /
// twitter.com addresses are accepted, and every one is reduced to the canonical
// x.com form, so the same post entered two ways is one item.

const X_HOSTS = new Set([
  'x.com',
  'www.x.com',
  'mobile.x.com',
  'twitter.com',
  'www.twitter.com',
  'mobile.twitter.com',
]);

// First path segments that are X pages rather than accounts.
const RESERVED = new Set([
  'i',
  'home',
  'search',
  'explore',
  'hashtag',
  'settings',
  'intent',
  'share',
  'login',
  'messages',
  'notifications',
  'compose',
  'tos',
  'privacy',
]);

const HANDLE = /^[A-Za-z0-9_]{1,15}$/;
const POST_ID = /^\d{1,25}$/;

export const profileUrl = (handle: string) => `https://x.com/${handle}`;
export const postUrl = (handle: string, postId: string) =>
  `https://x.com/${handle}/status/${postId}`;

export function isHandle(value: string): boolean {
  return HANDLE.test(value) && !RESERVED.has(value.toLowerCase());
}

// "@Vexol" or "vexol" → "vexol".
export function normalizeHandle(input: string): string {
  const handle = input.trim().replace(/^@/, '');
  if (!isHandle(handle)) throw new HttpError(400, `Not a valid X handle: ${input.slice(0, 40)}`);
  return handle.toLowerCase();
}

export type XUrl =
  { kind: 'post'; handle: string; postId: string } | { kind: 'profile'; handle: string };

export function parseXUrl(input: string): XUrl {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    throw new HttpError(400, 'Not a valid URL');
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new HttpError(400, 'Only http and https URLs are accepted');
  }
  if (url.username || url.password || url.port) throw new HttpError(400, 'Not an X URL');
  if (!X_HOSTS.has(url.hostname.toLowerCase())) {
    throw new HttpError(400, 'Only x.com and twitter.com URLs are accepted');
  }
  const [first, second, third] = url.pathname.split('/').filter(Boolean);
  if (!first || !isHandle(first)) throw new HttpError(400, 'The URL does not name an X account');
  const handle = first.toLowerCase();
  if (second === undefined) return { kind: 'profile', handle };
  if (second === 'status' && third && POST_ID.test(third)) {
    return { kind: 'post', handle, postId: third };
  }
  throw new HttpError(400, 'The URL is neither a profile nor a post on X');
}

export function canonicalPostUrl(input: string): string {
  const parsed = parseXUrl(input);
  if (parsed.kind !== 'post') throw new HttpError(400, 'The URL is not a post URL');
  return postUrl(parsed.handle, parsed.postId);
}

// A link found in a post is kept only when it is a plain http(s) URL.
export function safeLink(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : null;
  } catch {
    return null;
  }
}
