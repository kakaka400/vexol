import { findCredentialConfig } from '../integrations/store';
import { HttpError } from '../shared/lib';

// Publishing to X through the project's Buffer account (Buffer GraphQL API). A
// thread goes out as one Buffer post with metadata.twitter.thread.

// Overridable so a local run can point the calls at a fake.
const bufferApiUrl = () => process.env.BUFFER_API_URL || 'https://api.buffer.com';

// What the Buffer integration supports for X, shown on the page so a missing
// function is stated rather than faked.
export const BUFFER_X_CAPABILITIES = {
  singlePost: true,
  thread: true,
  images: true,
  maxImages: 4,
  publishNow: true,
  schedule: true,
  statusLookup: true,
  video: false,
} as const;

export interface TwitterChannel {
  id: string;
  platform: string;
  username: string;
  displayName: string;
  profilePicture: string | null;
  connected: boolean;
}

export async function resolveBufferKey(projectId: number): Promise<string> {
  const stored = await findCredentialConfig(projectId, 'buffer');
  if (typeof stored?.apiKey === 'string' && stored.apiKey) return stored.apiKey;
  throw new HttpError(503, 'Add a Buffer API key in Settings → Integrations to publish to X');
}

type Json = Record<string, unknown>;
const obj = (value: unknown): Json =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Json) : {};
const str = (value: unknown): string | null => (typeof value === 'string' && value ? value : null);

// One GraphQL call. Buffer answers a refused mutation with HTTP 200 and a
// MutationError in the data; GraphQL-level errors come back in `errors`.
async function bufferRequest(
  apiKey: string,
  query: string,
  variables: Json,
  timeoutMs = 10_000,
): Promise<Json> {
  let response: Response;
  try {
    response = await fetch(bufferApiUrl(), {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, variables }),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch {
    throw new HttpError(503, 'Buffer is temporarily unavailable');
  }
  if (response.status === 401) throw new HttpError(502, 'Buffer rejected the API key');
  if (response.status === 429) throw new HttpError(502, 'Buffer rate limit reached, try later');
  if (!response.ok) throw new HttpError(502, `Buffer returned an error (${response.status})`);

  let body: Json;
  try {
    body = obj(await response.json());
  } catch {
    throw new HttpError(502, 'Buffer returned an invalid response');
  }
  const errors = Array.isArray(body.errors) ? body.errors.map(obj) : [];
  if (errors.length > 0) {
    const reason = str(errors[0]!.message);
    throw new HttpError(502, `Buffer refused: ${reason?.slice(0, 300) ?? 'unknown error'}`);
  }
  return obj(body.data);
}

const CHANNEL_FIELDS = 'id name displayName avatar service isDisconnected isLocked';

export async function listTwitterChannels(apiKey: string): Promise<TwitterChannel[]> {
  const data = await bufferRequest(apiKey, '{ account { organizations { id } } }', {});
  const organizations = Array.isArray(obj(data.account).organizations)
    ? (obj(data.account).organizations as unknown[]).map(obj)
    : [];
  const channels: TwitterChannel[] = [];
  for (const organization of organizations) {
    const id = str(organization.id);
    if (!id) continue;
    const result = await bufferRequest(
      apiKey,
      `query Channels($organizationId: OrganizationId!) {
        channels(input: { organizationId: $organizationId }) { ${CHANNEL_FIELDS} }
      }`,
      { organizationId: id },
    );
    for (const channel of Array.isArray(result.channels) ? result.channels.map(obj) : []) {
      if (channel.service !== 'twitter' || !str(channel.id)) continue;
      channels.push({
        id: str(channel.id)!,
        platform: 'twitter',
        username: str(channel.name) ?? '',
        displayName: str(channel.displayName) ?? str(channel.name) ?? '',
        profilePicture: str(channel.avatar),
        connected: channel.isDisconnected !== true && channel.isLocked !== true,
      });
    }
  }
  return channels;
}

export type BufferOutcome =
  | {
      kind: 'accepted';
      status: 'scheduled' | 'published' | 'failed';
      bufferPostId: string;
      platformPostUrl: string | null;
      response: Record<string, unknown>;
      error: string | null;
    }
  | { kind: 'refused'; error: string }
  | { kind: 'unknown'; error: string };

const POST_FIELDS = 'id text status dueAt sentAt externalLink error { message }';

// Reads Buffer's post object into the fields stored on the job. Only these
// fields are kept: no headers, no account tokens.
export function readBufferPost(
  payload: unknown,
): Extract<BufferOutcome, { kind: 'accepted' }> | null {
  const post = obj(payload);
  const id = str(post.id);
  if (!id) return null;
  const state = str(post.status);
  const error = str(obj(post.error).message);
  const status = state === 'sent' ? 'published' : state === 'error' ? 'failed' : 'scheduled';
  const link = str(post.externalLink);
  return {
    kind: 'accepted',
    status,
    bufferPostId: id,
    platformPostUrl: link && /^https:\/\//.test(link) ? link : null,
    response: {
      postId: id,
      status: state,
      dueAt: str(post.dueAt),
      sentAt: str(post.sentAt),
      externalLink: link,
      error,
    },
    error: status === 'failed' ? (error ?? 'Buffer reported the post as failed') : null,
  };
}

export function createPostInput(input: {
  posts: string[];
  images: string[];
  channelId: string;
  mode: 'now' | 'schedule';
  scheduledFor: Date | null;
}) {
  const assets = input.images.map((url) => ({ image: { url } }));
  const thread = input.posts.length > 1;
  return {
    text: input.posts[0],
    channelId: input.channelId,
    schedulingType: 'automatic',
    ...(input.mode === 'now'
      ? { mode: 'shareNow' }
      : { mode: 'customScheduled', dueAt: input.scheduledFor!.toISOString() }),
    assets: thread ? [] : assets,
    ...(thread
      ? {
          metadata: {
            twitter: {
              thread: input.posts.map((text, index) =>
                index === 0 ? { text, assets } : { text, assets: [] },
              ),
            },
          },
        }
      : {}),
  };
}

const CREATE_POST = `mutation CreatePost($input: CreatePostInput!) {
  createPost(input: $input) {
    ... on PostActionSuccess { post { ${POST_FIELDS} } }
    ... on MutationError { message }
  }
}`;

// One hand-off. A MutationError or a GraphQL error from Buffer is a definite
// failure; a timeout or a server error may or may not have created the post, so
// it is `unknown`. Buffer has no idempotency key: before a retry of an `unknown`
// job the caller looks the post up with findSentBufferPost.
export async function sendToBuffer(
  apiKey: string,
  input: Parameters<typeof createPostInput>[0],
): Promise<BufferOutcome> {
  try {
    const data = await bufferRequest(
      apiKey,
      CREATE_POST,
      { input: createPostInput(input) },
      30_000,
    );
    const result = obj(data.createPost);
    const message = str(result.message);
    if (message && !result.post) return { kind: 'refused', error: `Buffer refused: ${message}` };
    return readBufferPost(result.post) ?? { kind: 'unknown', error: 'Buffer returned no post id' };
  } catch (error) {
    if (error instanceof HttpError && /^Buffer (refused|rejected|rate limit)/.test(error.message)) {
      return { kind: 'refused', error: error.message };
    }
    return { kind: 'unknown', error: error instanceof Error ? error.message : 'Request failed' };
  }
}

export async function fetchBufferPost(apiKey: string, bufferPostId: string) {
  const data = await bufferRequest(
    apiKey,
    `query Post($id: PostId!) { post(input: { id: $id }) { ${POST_FIELDS} } }`,
    { id: bufferPostId },
  );
  return readBufferPost(data.post);
}

// The post an earlier, unanswered attempt may have created: the newest post on
// the channel with the same first text, created after the attempt started.
export async function findSentBufferPost(
  apiKey: string,
  input: { channelId: string; text: string; since: Date },
) {
  const channel = obj(
    (
      await bufferRequest(
        apiKey,
        'query Channel($id: ChannelId!) { channel(input: { id: $id }) { organizationId } }',
        { id: input.channelId },
      )
    ).channel,
  );
  const organizationId = str(channel.organizationId);
  if (!organizationId) return null;
  const data = await bufferRequest(
    apiKey,
    `query Posts($organizationId: OrganizationId!, $channelId: ChannelId!, $since: DateTime!) {
      posts(first: 50, input: {
        organizationId: $organizationId
        filter: { channelIds: [$channelId], createdAt: { start: $since } }
      }) { edges { node { ${POST_FIELDS} } } }
    }`,
    {
      organizationId,
      channelId: input.channelId,
      since: new Date(input.since.getTime() - 60_000).toISOString(),
    },
  );
  const edges = Array.isArray(obj(data.posts).edges) ? (obj(data.posts).edges as unknown[]) : [];
  const match = edges.map((edge) => obj(obj(edge).node)).find((post) => post.text === input.text);
  return match ? readBufferPost(match) : null;
}
