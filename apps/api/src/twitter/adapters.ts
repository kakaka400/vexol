import { findCredentialConfig } from '../integrations/store';
import { item, type MediaInfo, type NormalizedItem, type NormalizedProfile } from './normalize';
import { parseXUrl, postUrl, profileUrl, safeLink } from './urls';

// Research reads public X posts only through three Apify Actors ("Apify X Scraper"):
//
// - scraper_one/x-posts-search: search terms, hashtags and a question;
// - scraper_one/x-profile-posts-scraper: the recent posts of handles and profile URLs;
// - scraper_one/x-post-replies-scraper: post URLs, with their replies when asked.
//
// Each Actor is started, waited for, and its default dataset is read. The token is
// the project's Apify credential (Settings → Integrations → Apify X Scraper) or
// the server's APIFY_TOKEN; it never reaches the browser. Without a token research
// does not run. A 401, 402, 403 or 429 from Apify stops the whole run
// (ResearchStop): it is never retried and never routed around through another source.

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
  replies?: boolean;
  tags: string[];
  context?: string;
}

// One Actor run, as shown in Activity.
export interface ApifyRun {
  actor: string;
  runId: string | null;
  datasetId: string | null;
  status: string;
  items: number;
  error: string | null;
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
  apifyRuns: ApifyRun[];
}

export const ACTORS = {
  search: 'scraper_one/x-posts-search',
  profile: 'scraper_one/x-profile-posts-scraper',
  replies: 'scraper_one/x-post-replies-scraper',
} as const;

const ADAPTER = 'apify';
const NAME = 'Apify X Scraper';
const REQUEST_TIMEOUT_MS = 70_000;
// The Actors accept at most this many URLs per run on the free plan.
const URLS_PER_RUN = 5;
const apifyBase = () => process.env.APIFY_API_BASE_URL || 'https://api.apify.com/v2';
const runTimeoutMs = () => Number(process.env.APIFY_RUN_TIMEOUT_MS) || 5 * 60_000;

export async function apifyToken(projectId: number): Promise<string | null> {
  const config = await findCredentialConfig(projectId, 'apify');
  const token = config?.apiToken;
  if (typeof token === 'string' && token.length > 0) return token;
  return process.env.APIFY_TOKEN || null;
}

export async function apifyRequest(
  token: string,
  path: string,
  init: { method?: string; query?: Record<string, string | undefined>; body?: unknown } = {},
): Promise<unknown | null> {
  const url = new URL(`${apifyBase()}${path}`);
  for (const [key, value] of Object.entries(init.query ?? {}))
    if (value) url.searchParams.set(key, value);
  let response: Response;
  try {
    response = await fetch(url, {
      method: init.method ?? 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        ...(init.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      redirect: 'error',
    });
  } catch {
    throw new AdapterError(`${NAME}: no answer within ${REQUEST_TIMEOUT_MS / 1000}s`, true);
  }
  if (response.status === 401) {
    throw new ResearchStop(
      'unauthorized',
      NAME,
      `${NAME} refused the API token (401). Research stopped.`,
    );
  }
  if (response.status === 402) {
    throw new ResearchStop(
      'denied',
      NAME,
      `${NAME} needs a paid plan or more credit for this run (402). Research stopped.`,
    );
  }
  if (response.status === 403) {
    throw new ResearchStop(
      'forbidden',
      NAME,
      `${NAME} denied access (403). The token may not run this Actor. Research stopped.`,
    );
  }
  if (response.status === 429) {
    throw new ResearchStop('rate_limited', NAME, `${NAME} rate limit reached. Research stopped.`);
  }
  if (response.status === 404) return null;
  if (response.status >= 500) throw new AdapterError(`${NAME} returned ${response.status}`, true);
  if (!response.ok) throw new AdapterError(`${NAME} returned ${response.status}`, false);
  try {
    return await response.json();
  } catch {
    throw new AdapterError(`${NAME} returned an invalid response`, false);
  }
}

type Json = Record<string, unknown>;
const obj = (value: unknown): Json =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Json) : {};
const arr = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
const str = (value: unknown): string | null => (typeof value === 'string' && value ? value : null);
const num = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;

const FINISHED = ['SUCCEEDED', 'FAILED', 'ABORTED', 'TIMED-OUT'];

// Starts an Actor, waits until it finishes and returns the items of its default
// dataset. Every run is added to `runs`, also when it fails.
async function runActor(
  token: string,
  actor: string,
  input: Json,
  maxItems: number,
  runs: ApifyRun[],
): Promise<unknown[]> {
  const run: ApifyRun = {
    actor,
    runId: null,
    datasetId: null,
    status: 'STARTING',
    items: 0,
    error: null,
  };
  runs.push(run);
  try {
    const started = obj(
      obj(
        await apifyRequest(token, `/acts/${actor.replace('/', '~')}/runs`, {
          method: 'POST',
          query: { maxItems: String(maxItems) },
          body: input,
        }),
      ).data,
    );
    run.runId = str(started.id);
    run.datasetId = str(started.defaultDatasetId);
    run.status = str(started.status) ?? 'READY';
    if (!run.runId) throw new AdapterError(`${NAME} did not start ${actor}`, false);

    const deadline = Date.now() + runTimeoutMs();
    while (!FINISHED.includes(run.status)) {
      if (Date.now() > deadline) {
        await apifyRequest(token, `/actor-runs/${run.runId}/abort`, { method: 'POST' }).catch(
          () => null,
        );
        run.status = 'ABORTED';
        throw new AdapterError(
          `${NAME}: ${actor} did not finish within ${runTimeoutMs() / 1000}s and was aborted`,
          true,
        );
      }
      const waitSeconds = Math.max(1, Math.min(60, Math.floor((deadline - Date.now()) / 1000)));
      const current = obj(
        obj(
          await apifyRequest(token, `/actor-runs/${run.runId}`, {
            query: { waitForFinish: String(waitSeconds) },
          }),
        ).data,
      );
      run.status = str(current.status) ?? run.status;
      run.datasetId = str(current.defaultDatasetId) ?? run.datasetId;
    }
    if (run.status !== 'SUCCEEDED') {
      throw new AdapterError(
        `${NAME}: ${actor} run ${run.runId} ended with ${run.status}`,
        run.status === 'TIMED-OUT',
      );
    }
    if (!run.datasetId) return [];
    const items = arr(
      await apifyRequest(token, `/datasets/${run.datasetId}/items`, {
        query: { clean: 'true', format: 'json', limit: String(maxItems) },
      }),
    );
    run.items = items.length;
    return items;
  } catch (error) {
    run.error = error instanceof Error ? error.message : 'Unknown error';
    if (run.status === 'STARTING') run.status = 'NOT STARTED';
    throw error;
  }
}

// Converts one dataset item of any of the three Actors into an item. A reply
// carries replyId/replyUrl/replyText; a post postId/postUrl/postText.
export function normalizeApifyPost(raw: unknown, fetchedAt: Date): NormalizedItem | null {
  const post = obj(raw);
  const author = obj(post.author);
  const url = str(post.replyUrl) ?? str(post.postUrl);
  const text = str(post.replyText) ?? str(post.postText);
  let handle = str(author.screenName);
  let id = str(post.replyId) ?? str(post.postId);
  if (url) {
    try {
      const parsed = parseXUrl(url);
      if (parsed.kind === 'post') {
        handle ??= parsed.handle;
        id ??= parsed.postId;
      }
    } catch {
      // Keep the handle and id from the other fields.
    }
  }
  if (!handle || !id || !/^\d+$/.test(id) || text == null) return null;
  const timestamp = num(post.timestamp);
  const metrics: Record<string, number> = {};
  for (const [from, to] of [
    ['favouriteCount', 'like_count'],
    ['repostCount', 'retweet_count'],
    ['replyCount', 'reply_count'],
    ['quoteCount', 'quote_count'],
    ['viewCount', 'impression_count'],
    ['viewsCount', 'impression_count'],
  ] as const) {
    const value = num(post[from]);
    if (value != null) metrics[to] = value;
  }
  return item({
    postId: id,
    canonicalUrl: postUrl(handle.toLowerCase(), id),
    authorHandle: handle,
    authorName: str(author.name),
    text,
    publishedAt: timestamp != null ? new Date(timestamp) : null,
    fetchedAt,
    language: null,
    metrics: Object.keys(metrics).length > 0 ? metrics : null,
    media: arr(post.media).map((m): MediaInfo => ({
      type: str(obj(m).type) ?? 'media',
      url: safeLink(obj(m).mediaUrlHttps),
      altText: null,
    })),
    links: [],
    adapter: ADAPTER,
    sourceStatus: 'ok',
    verificationStatus: 'unverified',
  });
}

// The author of a dataset item as a profile, when the item carries one.
export function normalizeApifyAuthor(raw: unknown, fetchedAt: Date): NormalizedProfile | null {
  const author = obj(obj(raw).author);
  const handle = str(author.screenName)?.toLowerCase();
  if (!handle) return null;
  return {
    handle,
    name: str(author.name),
    description: str(author.description),
    followers: num(author.followersCount),
    profileUrl: profileUrl(handle),
    fetchedAt,
  };
}

// The X search query: terms, hashtags or the question, the handles as from:, and
// the period and language in X search syntax.
export function searchQuery(input: ResearchInput): string | null {
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
  if (input.since) query += ` since:${input.since}`;
  if (input.until) {
    const next = new Date(`${input.until}T00:00:00Z`);
    next.setUTCDate(next.getUTCDate() + 1);
    query += ` until:${next.toISOString().slice(0, 10)}`;
  }
  return `${query} -filter:retweets`.slice(0, 512);
}

function inPeriod(entry: NormalizedItem, input: ResearchInput): boolean {
  if (!entry.publishedAt) return true;
  const time = entry.publishedAt.getTime();
  if (input.since && time < new Date(`${input.since}T00:00:00Z`).getTime()) return false;
  if (input.until && time > new Date(`${input.until}T23:59:59Z`).getTime()) return false;
  return true;
}

const chunks = <T>(list: T[], size: number): T[][] =>
  Array.from({ length: Math.ceil(list.length / size) }, (_, i) =>
    list.slice(i * size, i * size + size),
  );

export async function collect(projectId: number, input: ResearchInput): Promise<CollectResult> {
  const result: CollectResult = {
    items: [],
    profiles: [],
    adapters: [],
    warnings: [],
    stop: null,
    transientFailures: 0,
    requests: 0,
    apifyRuns: [],
  };
  const token = await apifyToken(projectId);
  if (!token) {
    result.warnings.push(
      'Research needs an Apify API token (Settings → Integrations → Apify X Scraper). Nothing was collected.',
    );
    return result;
  }
  const fetchedAt = () => new Date();
  // What the run may still add; every Actor run is capped to it, so a run never
  // pays for more results than were asked for.
  const remaining = () => input.maxResults - result.items.length;
  const actor = async (name: string, actorInput: Json, maxItems: number) => {
    if (!result.adapters.includes(ADAPTER)) result.adapters.push(ADAPTER);
    result.requests += 1;
    return runActor(token, name, actorInput, maxItems, result.apifyRuns);
  };
  const keep = (raw: unknown[]) => {
    const now = fetchedAt();
    for (const entry of raw) {
      const found = normalizeApifyPost(entry, now);
      if (found) result.items.push(found);
      const profile = normalizeApifyAuthor(entry, now);
      if (profile && !result.profiles.some((p) => p.handle === profile.handle))
        result.profiles.push(profile);
    }
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

  for (const batch of chunks(posts, URLS_PER_RUN)) {
    steps.push(async () => {
      // Without replies, only the original post of each URL is kept.
      const perPost = input.replies ? Math.max(1, Math.ceil(remaining() / batch.length)) : 1;
      const raw = await actor(
        ACTORS.replies,
        {
          postUrls: batch.map((post) => postUrl(post.handle, post.postId)),
          includeOriginalPost: true,
          resultsLimit: perPost,
        },
        input.replies ? remaining() : batch.length,
      );
      const wanted = new Set(batch.map((post) => post.postId));
      const now = fetchedAt();
      const before = result.items.length;
      keep(
        input.replies
          ? raw
          : raw.filter((entry) => {
              const found = normalizeApifyPost(entry, now);
              return found?.postId != null && wanted.has(found.postId);
            }),
      );
      const ids = new Set(result.items.slice(before).map((entry) => entry.postId));
      for (const post of batch)
        if (!ids.has(post.postId))
          result.warnings.push(`Post ${post.postId} is not available publicly.`);
    });
  }

  if (query) {
    steps.push(async () => {
      if (remaining() <= 0) return;
      keep(
        await actor(
          ACTORS.search,
          { query, resultsCount: remaining(), searchType: 'latest' },
          remaining(),
        ),
      );
    });
  } else if (handles.size > 0) {
    for (const batch of chunks([...handles], URLS_PER_RUN)) {
      steps.push(async () => {
        if (remaining() <= 0) return;
        const raw = await actor(
          ACTORS.profile,
          {
            profileUrls: batch.map((handle) => profileUrl(handle)),
            resultsLimit: Math.max(1, Math.ceil(remaining() / batch.length)),
            skipPinnedPosts: true,
          },
          remaining(),
        );
        keep(raw);
        for (const handle of batch)
          if (!raw.some((entry) => normalizeApifyAuthor(entry, fetchedAt())?.handle === handle))
            result.warnings.push(`No public posts found for @${handle}.`);
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
