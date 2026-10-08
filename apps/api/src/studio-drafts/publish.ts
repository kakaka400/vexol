import { HttpError } from '../shared/lib';
import { zernioRequest } from '../social/client';

// Publishing a Studio draft through Zernio. Zernio holds the connected social
// accounts and posts at the scheduled time; Vexol only hands it the content once.

export type PublishFormat = 'post' | 'story' | 'reel';

export interface PublishTarget {
  accountId: string;
  platform: string;
  format: PublishFormat;
}

export interface PublishAccount {
  id: string;
  platform: string;
  username: string;
  displayName: string;
  profilePicture: string | null;
  connected: boolean;
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

export async function listPublishAccounts(apiKey: string): Promise<PublishAccount[]> {
  const payload = (await zernioRequest(apiKey, 'GET', '/accounts', {
    // Zernio refuses a limit without a page ("page and limit must be provided together").
    query: { page: '1', limit: '100' },
  })) as { accounts?: unknown };
  const accounts = Array.isArray(payload?.accounts) ? payload.accounts : [];
  return accounts
    .map((raw) => (raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}))
    .filter((account) => text(account._id) && text(account.platform))
    .map((account) => ({
      id: text(account._id),
      platform: text(account.platform),
      username: text(account.username),
      displayName: text(account.displayName),
      profilePicture: text(account.profilePicture) || null,
      connected: account.isActive !== false && account.needsReconnection !== true,
    }));
}

// The wall-clock time in the given zone, without an offset: Zernio reads
// scheduledFor in the time zone sent with it.
export function wallClock(at: Date, timeZone: string): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(at)
      .map((part) => [part.type, part.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}`;
}

// Instagram takes JPEG and PNG only; a Reel is always a video, which Studio does
// not make. Checked here so the person gets a plain reason before Zernio is called.
export function assertPublishable(
  targets: PublishTarget[],
  image: { url: string; contentType: string } | null,
): void {
  for (const target of targets) {
    if (target.format !== 'post' && target.platform !== 'instagram') {
      throw new HttpError(400, 'Story and Reel are only available for Instagram');
    }
    if (target.platform !== 'instagram') continue;
    if (target.format === 'reel') {
      throw new HttpError(
        400,
        'An Instagram Reel needs a video. Studio images can go out as a post or a story.',
      );
    }
    if (!image) throw new HttpError(400, 'Instagram needs an image. This draft has none.');
    if (!['image/jpeg', 'image/png'].includes(image.contentType)) {
      throw new HttpError(400, 'Instagram takes JPEG or PNG images only');
    }
  }
}

// Creates the scheduled post at Zernio and returns its id. The idempotency key
// makes a retried request return the post created the first time.
export async function schedulePost(
  apiKey: string,
  input: {
    caption: string;
    image: { url: string; contentType: string } | null;
    targets: PublishTarget[];
    scheduledFor: Date;
    timezone: string;
    idempotencyKey: string;
  },
): Promise<string> {
  assertPublishable(input.targets, input.image);
  const payload = (await zernioRequest(apiKey, 'POST', '/posts', {
    idempotencyKey: input.idempotencyKey,
    body: {
      content: input.caption,
      mediaItems: input.image ? [{ type: 'image', url: input.image.url }] : [],
      platforms: input.targets.map((target) => ({
        platform: target.platform,
        accountId: target.accountId,
        ...(target.format === 'story' ? { platformSpecificData: { contentType: 'story' } } : {}),
      })),
      scheduledFor: wallClock(input.scheduledFor, input.timezone),
      timezone: input.timezone,
    },
  })) as { post?: { _id?: unknown } };
  const id = payload?.post?._id;
  if (typeof id !== 'string' || !id) throw new HttpError(502, 'Zernio returned no post id');
  return id;
}
