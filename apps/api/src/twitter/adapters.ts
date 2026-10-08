import { findCredentialConfig } from '../integrations/store';
import { item, type MediaInfo, type NormalizedItem, type NormalizedProfile } from './normalize';
import { parseXUrl, postUrl, profileUrl, safeLink } from './urls';

// The sources research reads public posts from. Both are official X endpoints:
//
// - x_api: the X API v2 with the project's own bearer token (Settings →
//   Integrations → X API). Reads timelines, recent search and single posts.
// - oembed: publish.twitter.com/oembed, public and without a key. Reads the text,
//   author and date of one public post URL; no metrics.
//
// No adapter logs in, sends cookies, renders a page in a browser, or uses a proxy.
// A 401, 403 or 429 stops the whole run (ResearchStop): it is never retried and
// never routed around through another source.

export type StopReason = 'unauthorized' | 'forbidden' | 'rate_limited' | 'denied';

export class ResearchStop extends Error {
  constructor(
    readonly reason: StopReason,
    readonly adapter: string,
    message: string,
  ) {
    super(message);
  }
}

// A failed request that does not stop the run. `transient` failures (timeouts,
// 5xx) make the run eligible for a retry when they leave it without results.
export class AdapterError extends Error {
  constructor(
    message: string,
    readonly transient: boolean,
  ) {
    super(message);
  }
}

export interface ResearchInput {
  question?: string;
  handles: string[];
  urls: string[];
  terms: string[];
  hashtags: string[];
  since?: string;
  until?: string;
  language?: string;
  maxResults: number;
  tags: string[];
  context?: string;
}

export interface CollectResult {
  items: NormalizedItem[];
  profiles: NormalizedProfile[];
  adapters: string[];
  warnings: string[];
  stop: ResearchStop | null;
  // Requests that failed and could succeed later, and how many were made.
  transientFailures: number;
  requests: number;
}

const X_TIMEOUT_MS = 15_000;
const xApiBase = () => process.env.X_API_BASE_URL || 'https://api.x.com/2';
const oembedBase = () => process.env.X_OEMBED_URL || 'https://publish.twitter.com/oembed';

const TWEET_FIELDS = 'created_at,lang,public_metrics,entities,attachments,author_id,note_tweet';
const EXPANSIONS = 'author_id,attachments.media_keys';
const MEDIA_FIELDS = 'type,url,preview_image_url,alt_text';

export async function xApiToken(projectId: number): Promise<string | null> {
  const config = await findCredentialConfig(projectId, 'x_api');
  const token = config?.bearerToken;
  return typeof token === 'string' && token.length > 0 ? token : null;
}

async function request(
  adapter: string,
  url: URL,
  headers: Record<string, string>,
): Promise<unknown | null> {
  let response: Response;
  try {
    response = await fetch(url, {
      headers,
      signal: AbortSignal.timeout(X_TIMEOUT_MS),
      redirect: 'error',
    });
  } catch {
    throw new AdapterError(`${adapter}: no answer within ${X_TIMEOUT_MS / 1000}s`, true);
  }
  if (response.status === 401) {
    throw new ResearchStop(
      'unauthorized',
      adapter,
      `${adapter} refused the request (401). Research stopped.`,
    );
  }
  if (response.status === 403) {
    throw new ResearchStop(
      'forbidden',
      adapter,
      `${adapter} denied access (403). The content is not public or the access level does not allow it. Research stopped.`,
    );
  }
  if (response.status === 429) {
    const reset = Number(response.headers.get('x-rate-limit-reset'));
    const until =
      Number.isFinite(reset) && reset > 0 ? ` until ${new Date(reset * 1000).toISOString()}` : '';
    throw new ResearchStop(
      'rate_limited',
      adapter,
      `${adapter} rate limit reached${until}. Research stopped.`,
    );
  }
  if (response.status === 404) return null;
  if (response.status >= 500)
    throw new AdapterError(`${adapter} returned ${response.status}`, true);
  if (!response.ok) throw new AdapterError(`${adapter} returned ${response.status}`, false);
  try {
    return await response.json();
  } catch {
    throw new AdapterError(`${adapter} returned an invalid response`, false);
  }
}

type Json = Record<string, unknown>;
const obj = (value: unknown): Json =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Json) : {};
const arr = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
const str = (value: unknown): string | null => (typeof value === 'string' && value ? value : null);

function date(value: unknown): Date | null {
  const text = str(value);
  if (!text) return null;
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

// Converts an X API v2 response (data + includes) into items.
export function normalizeXApiTweets(payload: unknown, fetchedAt: Date): NormalizedItem[] {
  const body = obj(payload);
  const includes = obj(body.includes);
  const users = new Map(arr(includes.users).map((u) => [str(obj(u).id), obj(u)]));
  const media = new Map(arr(includes.media).map((m) => [str(obj(m).media_key), obj(m)]));
  const tweets = Array.isArray(body.data) ? body.data : body.data ? [body.data] : [];
  const items: NormalizedItem[] = [];
  for (const raw of tweets) {
    const tweet = obj(raw);
    const id = str(tweet.id);
    const author = users.get(str(tweet.author_id));
    const handle = str(author?.username);
    if (!id || !handle) continue;
    const metrics = obj(tweet.public_metrics);
    const attachments = arr(obj(tweet.attachments).media_keys)
      .map((key) => media.get(str(key)))
      .filter((m): m is Json => m != null)
      .map((m): MediaInfo => ({
        type: str(m.type) ?? 'media',
        url: safeLink(m.url ?? m.preview_image_url),
        altText: str(m.alt_text),
      }));
    items.push(
      item({
        postId: id,
        canonicalUrl: postUrl(handle.toLowerCase(), id),
        authorHandle: handle,
        authorName: str(author?.name),
        text: str(obj(tweet.note_tweet).text) ?? str(tweet.text) ?? '',
        publishedAt: date(tweet.created_at),
        fetchedAt,
        language: str(tweet.lang),
        metrics: Object.fromEntries(
          Object.entries(metrics).filter(([, value]) => typeof value === 'number'),
        ) as Record<string, number>,
        media: attachments,
        links: arr(obj(tweet.entities).urls)
          .map((u) => safeLink(obj(u).expanded_url))
          .filter((u): u is string => u != null),
        adapter: 'x_api',
        sourceStatus: 'ok',
        verificationStatus: 'unverified',
      }),
    );
  }
  return items;
}

function decodeEntities(text: string): string {
  return text
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&mdash;/g, '—')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&');
}

// Reads one oEmbed answer. The post text is the <p> of the embed blockquote and
// the date is the text of its last link, which X prints as "October 1, 2026".
export function normalizeOembed(
  payload: unknown,
  requested: { handle: string; postId: string },
  fetchedAt: Date,
): NormalizedItem | null {
  const body = obj(payload);
  const html = str(body.html);
  if (!html) return null;
  const paragraph = html.match(/<p([^>]*)>([\s\S]*?)<\/p>/i);
  if (!paragraph) return null;
  const language = paragraph[1].match(/lang="([a-z-]+)"/i)?.[1] ?? null;
  const links = [...paragraph[2].matchAll(/href="([^"]+)"/g)]
    .map((m) => safeLink(decodeEntities(m[1])))
    .filter((u): u is string => u != null);
  const text = decodeEntities(paragraph[2].replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, ''));
  const anchors = [...html.matchAll(/<a[^>]*>([^<]*)<\/a>/g)];
  const lastAnchor = anchors.at(-1)?.[1];
  const publishedAt = lastAnchor ? date(`${decodeEntities(lastAnchor)} UTC`) : null;
  const authorUrl = str(body.author_url);
  let handle = requested.handle;
  if (authorUrl) {
    try {
      const parsed = parseXUrl(authorUrl);
      handle = parsed.handle;
    } catch {
      // Keep the handle from the requested URL.
    }
  }
  return item({
    postId: requested.postId,
    canonicalUrl: postUrl(handle, requested.postId),
    authorHandle: handle,
    authorName: str(body.author_name),
    text,
    publishedAt,
    fetchedAt,
    language: language === 'zxx' ? null : language,
    metrics: null,
    media: [],
    links,
    adapter: 'oembed',
    sourceStatus: 'partial',
    verificationStatus: 'unverified',
    warnings: ['oEmbed returns no metrics and only the publication date, not the time.'],
  });
}

export function normalizeXApiUser(payload: unknown, fetchedAt: Date): NormalizedProfile | null {
  const user = obj(obj(payload).data);
  const handle = str(user.username)?.toLowerCase();
  if (!handle) return null;
  const followers = obj(user.public_metrics).followers_count;
  return {
    handle,
    name: str(user.name),
    description: str(user.description),
    followers: typeof followers === 'number' ? followers : null,
    profileUrl: profileUrl(handle),
    fetchedAt,
  };
}

function buildUrl(base: string, path: string, query: Record<string, string | undefined>): URL {
  const url = new URL(`${base}${path}`);
  for (const [key, value] of Object.entries(query)) if (value) url.searchParams.set(key, value);
  return url;
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

function searchQuery(input: ResearchInput): string | null {
  const words = [
    ...input.terms.map((term) => (/\s/.test(term) ? `"${term.replace(/"/g, '')}"` : term)),
    ...input.hashtags.map((tag) => `#${tag}`),
  ];
  if (words.length === 0 && input.question)
    words.push(input.question.replace(/["()]/g, ' ').trim());
  if (words.length === 0) return null;
  let query = words.length > 1 ? `(${words.join(' OR ')})` : words[0]!;
  if (input.handles.length > 0) {
    query += ` (${input.handles.map((handle) => `from:${handle}`).join(' OR ')})`;
  }
  if (input.language) query += ` lang:${input.language}`;
  return `${query} -is:retweet`.slice(0, 512);
}

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

function inPeriod(entry: NormalizedItem, input: ResearchInput): boolean {
  if (!entry.publishedAt) return true;
  const time = entry.publishedAt.getTime();
  if (input.since && time < new Date(`${input.since}T00:00:00Z`).getTime()) return false;
  if (input.until && time > new Date(`${input.until}T23:59:59Z`).getTime()) return false;
  return !input.language || !entry.language || entry.language === input.language;
}

export async function collect(projectId: number, input: ResearchInput): Promise<CollectResult> {
  const result: CollectResult = {
    items: [],
    profiles: [],
    adapters: [],
    warnings: [],
    stop: null,
    transientFailures: 0,
    requests: 0,
  };
  const token = await xApiToken(projectId);
  const xHeaders: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
  const fetchedAt = () => new Date();
  const use = (adapter: string) => {
    if (!result.adapters.includes(adapter)) result.adapters.push(adapter);
  };
  const xGet = async (path: string, query: Record<string, string | undefined>) => {
    use('x_api');
    result.requests += 1;
    return request('X API', buildUrl(xApiBase(), path, query), xHeaders);
  };

  const handles = new Set(input.handles);
  const posts: Array<{ handle: string; postId: string }> = [];
  for (const url of input.urls) {
    const parsed = parseXUrl(url);
    if (parsed.kind === 'post') posts.push(parsed);
    else handles.add(parsed.handle);
  }
  const query = searchQuery({ ...input, handles: [...handles] });

  const steps: Array<() => Promise<void>> = [];

  for (const post of posts) {
    steps.push(async () => {
      if (token) {
        const payload = await xGet(`/tweets/${post.postId}`, {
          'tweet.fields': TWEET_FIELDS,
          expansions: EXPANSIONS,
          'user.fields': 'username,name',
          'media.fields': MEDIA_FIELDS,
        });
        const found = payload ? normalizeXApiTweets(payload, fetchedAt()) : [];
        if (found.length === 0)
          result.warnings.push(`Post ${post.postId} is not available publicly.`);
        result.items.push(...found);
        return;
      }
      use('oembed');
      result.requests += 1;
      const url = buildUrl(oembedBase(), '', {
        url: postUrl(post.handle, post.postId),
        omit_script: 'true',
        dnt: 'true',
      });
      const payload = await request('oEmbed', url, {});
      const found = payload ? normalizeOembed(payload, post, fetchedAt()) : null;
      if (!found) result.warnings.push(`Post ${post.postId} is not available publicly.`);
      else result.items.push(found);
    });
  }

  if (query) {
    steps.push(async () => {
      if (!token) {
        result.warnings.push(
          'Searching X needs an X API bearer token (Settings → Integrations → X API). The search part was skipped.',
        );
        return;
      }
      let startTime = input.since ? new Date(`${input.since}T00:00:00Z`) : null;
      const earliest = new Date(Date.now() - SEVEN_DAYS_MS + 60_000);
      if (startTime && startTime < earliest) {
        result.warnings.push(
          'The X API recent search covers the last 7 days; older posts are not included.',
        );
        startTime = earliest;
      }
      const endTime = input.until ? new Date(`${input.until}T23:59:59Z`) : null;
      const payload = await xGet('/tweets/search/recent', {
        query,
        max_results: String(clamp(input.maxResults, 10, 100)),
        'tweet.fields': TWEET_FIELDS,
        expansions: EXPANSIONS,
        'user.fields': 'username,name',
        'media.fields': MEDIA_FIELDS,
        start_time: startTime?.toISOString(),
        end_time:
          endTime && endTime.getTime() < Date.now() - 30_000 ? endTime.toISOString() : undefined,
      });
      result.items.push(...(payload ? normalizeXApiTweets(payload, fetchedAt()) : []));
    });
  } else {
    for (const handle of handles) {
      steps.push(async () => {
        if (!token) {
          result.warnings.push(
            `Reading the posts of @${handle} needs an X API bearer token (Settings → Integrations → X API).`,
          );
          return;
        }
        const user = await xGet(`/users/by/username/${handle}`, {
          'user.fields': 'description,public_metrics,name,username',
        });
        const profile = user ? normalizeXApiUser(user, fetchedAt()) : null;
        if (!profile) {
          result.warnings.push(`@${handle} does not exist or is not public.`);
          return;
        }
        result.profiles.push(profile);
        const id = str(obj(obj(user).data).id);
        const timeline = await xGet(`/users/${id}/tweets`, {
          max_results: String(clamp(input.maxResults, 5, 100)),
          'tweet.fields': TWEET_FIELDS,
          expansions: EXPANSIONS,
          'user.fields': 'username,name',
          'media.fields': MEDIA_FIELDS,
          start_time: input.since ? `${input.since}T00:00:00Z` : undefined,
        });
        result.items.push(...(timeline ? normalizeXApiTweets(timeline, fetchedAt()) : []));
      });
    }
  }

  if (steps.length === 0) {
    result.warnings.push('The request names nothing to look up.');
  }

  for (const step of steps) {
    try {
      await step();
    } catch (error) {
      if (error instanceof ResearchStop) {
        result.stop = error;
        break;
      }
      if (error instanceof AdapterError) {
        if (error.transient) result.transientFailures += 1;
        result.warnings.push(error.message);
        continue;
      }
      throw error;
    }
  }

  const seen = new Set<string>();
  result.items = result.items
    .filter((entry) => inPeriod(entry, input))
    .filter((entry) => {
      const key = entry.postId ?? entry.canonicalUrl;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, input.maxResults);
  return result;
}
