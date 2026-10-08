import { HttpError } from '../shared/lib';
import { zernioRequest } from '../social/client';
import { listPublishAccounts, wallClock, type PublishAccount } from '../studio-drafts/publish';

// Publishing to X through the project's Zernio account, with the Zernio client
// Studio uses. A thread goes out as Zernio threadItems on one X account.

// What the Zernio integration supports for X, shown on the page so a missing
// function is stated rather than faked.
export const ZERNIO_X_CAPABILITIES = {
  singlePost: true,
  thread: true,
  images: true,
  maxImages: 4,
  publishNow: true,
  schedule: true,
  statusLookup: true,
  video: false,
} as const;

export async function listTwitterChannels(apiKey: string): Promise<PublishAccount[]> {
  return (await listPublishAccounts(apiKey)).filter((account) => account.platform === 'twitter');
}

export type ZernioOutcome =
  | {
      kind: 'accepted';
      status: 'scheduled' | 'published' | 'failed';
      zernioPostId: string;
      platformPostUrl: string | null;
      response: Record<string, unknown>;
      error: string | null;
    }
  | { kind: 'refused'; error: string }
  | { kind: 'unknown'; error: string };

type Json = Record<string, unknown>;
const obj = (value: unknown): Json =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Json) : {};
const str = (value: unknown): string | null => (typeof value === 'string' && value ? value : null);

// Reads Zernio's post object into the fields stored on the job. Only these fields
// are kept: no headers, no account tokens.
export function readZernioPost(
  payload: unknown,
): Extract<ZernioOutcome, { kind: 'accepted' }> | null {
  const body = obj(payload);
  const post = obj(body.post ?? body);
  const id = str(post._id) ?? str(post.id);
  if (!id) return null;
  const platforms = Array.isArray(post.platforms) ? post.platforms.map(obj) : [];
  const platform = platforms.find((entry) => entry.platform === 'twitter') ?? platforms[0] ?? {};
  const states = [str(platform.status), str(post.status)].filter(Boolean) as string[];
  const error = str(platform.errorMessage) ?? str(platform.error) ?? str(post.error);
  const status = states.includes('published')
    ? 'published'
    : states.some((state) => state === 'failed' || state === 'error')
      ? 'failed'
      : 'scheduled';
  const platformPostUrl = str(platform.platformPostUrl);
  return {
    kind: 'accepted',
    status,
    zernioPostId: id,
    platformPostUrl:
      platformPostUrl && /^https:\/\//.test(platformPostUrl) ? platformPostUrl : null,
    response: {
      postId: id,
      status: str(post.status),
      platformStatus: str(platform.status),
      platformPostId: str(platform.platformPostId),
      platformPostUrl,
      scheduledFor: str(post.scheduledFor),
      error,
    },
    error: status === 'failed' ? (error ?? 'Zernio reported the post as failed') : null,
  };
}

export function zernioBody(input: {
  posts: string[];
  images: string[];
  accountId: string;
  mode: 'now' | 'schedule';
  scheduledFor: Date | null;
  timezone: string;
}) {
  const mediaItems = input.images.map((url) => ({ type: 'image', url }));
  const thread = input.posts.length > 1;
  return {
    content: input.posts[0],
    ...(thread ? {} : { mediaItems }),
    platforms: [
      {
        platform: 'twitter',
        accountId: input.accountId,
        ...(thread
          ? {
              platformSpecificData: {
                threadItems: input.posts.map((content, index) =>
                  index === 0 && mediaItems.length > 0 ? { content, mediaItems } : { content },
                ),
              },
            }
          : {}),
      },
    ],
    ...(input.mode === 'now'
      ? { publishNow: true }
      : { scheduledFor: wallClock(input.scheduledFor!, input.timezone), timezone: input.timezone }),
  };
}

// One hand-off. A refusal from Zernio (4xx) is a definite failure; a timeout or a
// server error may or may not have created the post, so it is `unknown`.
export async function sendToZernio(
  apiKey: string,
  input: Parameters<typeof zernioBody>[0] & { idempotencyKey: string },
): Promise<ZernioOutcome> {
  try {
    const payload = await zernioRequest(apiKey, 'POST', '/posts', {
      idempotencyKey: input.idempotencyKey,
      body: zernioBody(input),
    });
    return readZernioPost(payload) ?? { kind: 'unknown', error: 'Zernio returned no post id' };
  } catch (error) {
    if (error instanceof HttpError && /^Zernio (refused|rejected)/.test(error.message)) {
      return { kind: 'refused', error: error.message };
    }
    return { kind: 'unknown', error: error instanceof Error ? error.message : 'Request failed' };
  }
}

export async function fetchZernioPost(apiKey: string, zernioPostId: string) {
  const payload = await zernioRequest(apiKey, 'GET', `/posts/${encodeURIComponent(zernioPostId)}`);
  return readZernioPost(payload);
}
