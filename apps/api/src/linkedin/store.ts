import { and, desc, eq } from 'drizzle-orm';
import { db, linkedinPost, user } from '@repo/db';
import { iso, pgErrorCode } from '../shared/lib';
import type { BufferOutcome } from '../twitter/publish';

export type LinkedinPostStatus = 'pending' | 'unknown' | 'scheduled' | 'published' | 'failed';

export interface LinkedinPostDto {
  id: string;
  text: string;
  imageUrls: string[];
  channelId: string;
  channelName: string | null;
  mode: 'now' | 'schedule';
  scheduledFor: string | null;
  status: LinkedinPostStatus;
  bufferPostId: string | null;
  platformPostUrl: string | null;
  lastError: string | null;
  createdByName: string | null;
  createdAt: string;
  updatedAt: string;
}

const columns = { post: linkedinPost, createdByName: user.name };

function present(row: {
  post: typeof linkedinPost.$inferSelect;
  createdByName: string | null;
}): LinkedinPostDto {
  const post = row.post;
  return {
    id: post.id,
    text: post.text,
    imageUrls: post.imageUrls,
    channelId: post.channelId,
    channelName: post.channelName,
    mode: post.mode as LinkedinPostDto['mode'],
    scheduledFor: post.scheduledFor ? iso(post.scheduledFor) : null,
    status: post.status as LinkedinPostStatus,
    bufferPostId: post.bufferPostId,
    platformPostUrl: post.platformPostUrl,
    lastError: post.lastError,
    createdByName: row.createdByName,
    createdAt: iso(post.createdAt),
    updatedAt: iso(post.updatedAt),
  };
}

export async function listPosts(projectId: number, limit = 100): Promise<LinkedinPostDto[]> {
  const rows = await db
    .select(columns)
    .from(linkedinPost)
    .leftJoin(user, eq(user.id, linkedinPost.createdBy))
    .where(eq(linkedinPost.projectId, projectId))
    .orderBy(desc(linkedinPost.createdAt))
    .limit(limit);
  return rows.map(present);
}

export async function getPost(projectId: number, postId: string) {
  const [row] = await db
    .select(columns)
    .from(linkedinPost)
    .leftJoin(user, eq(user.id, linkedinPost.createdBy))
    .where(and(eq(linkedinPost.projectId, projectId), eq(linkedinPost.id, postId)));
  return row ? present(row) : null;
}

// Inserts the post as `pending` before it goes to Buffer. A repeated
// idempotency key returns the earlier post and `created: false`, so a double
// submit sends nothing a second time.
export async function beginPost(input: {
  projectId: number;
  idempotencyKey: string;
  text: string;
  imageUrls: string[];
  channelId: string;
  channelName: string | null;
  mode: 'now' | 'schedule';
  scheduledFor: Date | null;
  userId: string;
}): Promise<{ created: boolean; post: LinkedinPostDto }> {
  try {
    const [row] = await db
      .insert(linkedinPost)
      .values({
        projectId: input.projectId,
        idempotencyKey: input.idempotencyKey,
        text: input.text,
        imageUrls: input.imageUrls,
        channelId: input.channelId,
        channelName: input.channelName,
        mode: input.mode,
        scheduledFor: input.scheduledFor,
        createdBy: input.userId,
      })
      .returning({ id: linkedinPost.id });
    return { created: true, post: (await getPost(input.projectId, row!.id))! };
  } catch (error) {
    if (pgErrorCode(error) !== '23505') throw error;
    const [existing] = await db
      .select({ id: linkedinPost.id })
      .from(linkedinPost)
      .where(
        and(
          eq(linkedinPost.projectId, input.projectId),
          eq(linkedinPost.idempotencyKey, input.idempotencyKey),
        ),
      );
    return { created: false, post: (await getPost(input.projectId, existing!.id))! };
  }
}

export async function finishPost(
  projectId: number,
  postId: string,
  outcome: BufferOutcome,
): Promise<LinkedinPostDto> {
  const values =
    outcome.kind === 'accepted'
      ? {
          status: outcome.status,
          bufferPostId: outcome.bufferPostId,
          platformPostUrl: outcome.platformPostUrl,
          lastError: outcome.error,
        }
      : { status: outcome.kind === 'refused' ? 'failed' : 'unknown', lastError: outcome.error };
  await db
    .update(linkedinPost)
    .set({ ...values, updatedAt: new Date() })
    .where(and(eq(linkedinPost.projectId, projectId), eq(linkedinPost.id, postId)));
  return (await getPost(projectId, postId))!;
}
