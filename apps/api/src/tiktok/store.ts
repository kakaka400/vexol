import { and, desc, eq } from 'drizzle-orm';
import { db, tiktokDraft, tiktokPost, tiktokTemplate, user } from '@repo/db';
import { iso, pgErrorCode } from '../shared/lib';
import type { BufferOutcome } from '../twitter/publish';

export interface AnimationFields {
  prompt: string;
  colors: string[];
  style: string;
  durationSeconds: number;
}

export interface TemplateDto extends AnimationFields {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export interface DraftDto extends AnimationFields {
  id: string;
  templateId: string | null;
  title: string;
  caption: string;
  videoUrl: string | null;
  createdByName: string | null;
  createdAt: string;
  updatedAt: string;
}

export type PostStatus = 'pending' | 'unknown' | 'scheduled' | 'published' | 'failed';

export interface PostDto {
  id: string;
  draftId: string | null;
  caption: string;
  videoUrl: string;
  channelId: string;
  channelName: string | null;
  mode: 'now' | 'schedule';
  scheduledFor: string | null;
  status: PostStatus;
  bufferPostId: string | null;
  platformPostUrl: string | null;
  lastError: string | null;
  createdByName: string | null;
  createdAt: string;
  updatedAt: string;
}

// ------------------------------------------------ templates

function presentTemplate(row: typeof tiktokTemplate.$inferSelect): TemplateDto {
  return {
    id: row.id,
    name: row.name,
    prompt: row.prompt,
    colors: row.colors,
    style: row.style,
    durationSeconds: row.durationSeconds,
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  };
}

const templateWhere = (projectId: number, id: string) =>
  and(eq(tiktokTemplate.projectId, projectId), eq(tiktokTemplate.id, id));

export async function listTemplates(projectId: number): Promise<TemplateDto[]> {
  const rows = await db
    .select()
    .from(tiktokTemplate)
    .where(eq(tiktokTemplate.projectId, projectId))
    .orderBy(desc(tiktokTemplate.updatedAt));
  return rows.map(presentTemplate);
}

export async function getTemplate(projectId: number, id: string): Promise<TemplateDto | null> {
  const [row] = await db.select().from(tiktokTemplate).where(templateWhere(projectId, id));
  return row ? presentTemplate(row) : null;
}

export async function createTemplate(
  projectId: number,
  input: { name: string } & AnimationFields,
): Promise<TemplateDto> {
  const [row] = await db
    .insert(tiktokTemplate)
    .values({ projectId, ...input })
    .returning();
  return presentTemplate(row!);
}

export async function updateTemplate(
  projectId: number,
  id: string,
  patch: Partial<{ name: string } & AnimationFields>,
): Promise<TemplateDto | null> {
  const [row] = await db
    .update(tiktokTemplate)
    .set({ ...patch, updatedAt: new Date() })
    .where(templateWhere(projectId, id))
    .returning();
  return row ? presentTemplate(row) : null;
}

export async function deleteTemplate(projectId: number, id: string): Promise<boolean> {
  const rows = await db
    .delete(tiktokTemplate)
    .where(templateWhere(projectId, id))
    .returning({ id: tiktokTemplate.id });
  return rows.length > 0;
}

// ------------------------------------------------ drafts

const draftColumns = { draft: tiktokDraft, createdByName: user.name };

function presentDraft(row: {
  draft: typeof tiktokDraft.$inferSelect;
  createdByName: string | null;
}): DraftDto {
  const draft = row.draft;
  return {
    id: draft.id,
    templateId: draft.templateId,
    title: draft.title,
    prompt: draft.prompt,
    colors: draft.colors,
    style: draft.style,
    durationSeconds: draft.durationSeconds,
    caption: draft.caption,
    videoUrl: draft.videoUrl,
    createdByName: row.createdByName,
    createdAt: iso(draft.createdAt),
    updatedAt: iso(draft.updatedAt),
  };
}

const draftWhere = (projectId: number, id: string) =>
  and(eq(tiktokDraft.projectId, projectId), eq(tiktokDraft.id, id));

export async function listDrafts(projectId: number): Promise<DraftDto[]> {
  const rows = await db
    .select(draftColumns)
    .from(tiktokDraft)
    .leftJoin(user, eq(user.id, tiktokDraft.createdBy))
    .where(eq(tiktokDraft.projectId, projectId))
    .orderBy(desc(tiktokDraft.updatedAt))
    .limit(200);
  return rows.map(presentDraft);
}

export async function getDraft(projectId: number, id: string): Promise<DraftDto | null> {
  const [row] = await db
    .select(draftColumns)
    .from(tiktokDraft)
    .leftJoin(user, eq(user.id, tiktokDraft.createdBy))
    .where(draftWhere(projectId, id));
  return row ? presentDraft(row) : null;
}

export async function createDraft(
  projectId: number,
  userId: string,
  input: AnimationFields & {
    templateId: string | null;
    title: string;
    caption: string;
    videoUrl: string | null;
  },
): Promise<DraftDto> {
  const [row] = await db
    .insert(tiktokDraft)
    .values({ projectId, createdBy: userId, ...input })
    .returning({ id: tiktokDraft.id });
  return (await getDraft(projectId, row!.id))!;
}

export async function updateDraft(
  projectId: number,
  id: string,
  patch: Partial<AnimationFields & { title: string; caption: string; videoUrl: string | null }>,
): Promise<DraftDto | null> {
  const rows = await db
    .update(tiktokDraft)
    .set({ ...patch, updatedAt: new Date() })
    .where(draftWhere(projectId, id))
    .returning({ id: tiktokDraft.id });
  return rows.length > 0 ? getDraft(projectId, id) : null;
}

export async function deleteDraft(projectId: number, id: string): Promise<boolean> {
  const rows = await db
    .delete(tiktokDraft)
    .where(draftWhere(projectId, id))
    .returning({ id: tiktokDraft.id });
  return rows.length > 0;
}

// ------------------------------------------------ posts

const postColumns = { post: tiktokPost, createdByName: user.name };

function presentPost(row: {
  post: typeof tiktokPost.$inferSelect;
  createdByName: string | null;
}): PostDto {
  const post = row.post;
  return {
    id: post.id,
    draftId: post.draftId,
    caption: post.caption,
    videoUrl: post.videoUrl,
    channelId: post.channelId,
    channelName: post.channelName,
    mode: post.mode as PostDto['mode'],
    scheduledFor: post.scheduledFor ? iso(post.scheduledFor) : null,
    status: post.status as PostStatus,
    bufferPostId: post.bufferPostId,
    platformPostUrl: post.platformPostUrl,
    lastError: post.lastError,
    createdByName: row.createdByName,
    createdAt: iso(post.createdAt),
    updatedAt: iso(post.updatedAt),
  };
}

export async function listPosts(projectId: number): Promise<PostDto[]> {
  const rows = await db
    .select(postColumns)
    .from(tiktokPost)
    .leftJoin(user, eq(user.id, tiktokPost.createdBy))
    .where(eq(tiktokPost.projectId, projectId))
    .orderBy(desc(tiktokPost.createdAt))
    .limit(100);
  return rows.map(presentPost);
}

export async function getPost(projectId: number, id: string): Promise<PostDto | null> {
  const [row] = await db
    .select(postColumns)
    .from(tiktokPost)
    .leftJoin(user, eq(user.id, tiktokPost.createdBy))
    .where(and(eq(tiktokPost.projectId, projectId), eq(tiktokPost.id, id)));
  return row ? presentPost(row) : null;
}

// Inserts the post as `pending` before it goes to Buffer. A repeated
// idempotency key returns the earlier post and `created: false`, so a repeated
// request sends nothing a second time.
export async function beginPost(input: {
  projectId: number;
  draftId: string;
  idempotencyKey: string;
  caption: string;
  videoUrl: string;
  channelId: string;
  channelName: string | null;
  mode: 'now' | 'schedule';
  scheduledFor: Date | null;
  userId: string;
}): Promise<{ created: boolean; post: PostDto }> {
  const { userId, ...values } = input;
  try {
    const [row] = await db
      .insert(tiktokPost)
      .values({ ...values, createdBy: userId })
      .returning({ id: tiktokPost.id });
    return { created: true, post: (await getPost(input.projectId, row!.id))! };
  } catch (error) {
    if (pgErrorCode(error) !== '23505') throw error;
    const [existing] = await db
      .select({ id: tiktokPost.id })
      .from(tiktokPost)
      .where(
        and(
          eq(tiktokPost.projectId, input.projectId),
          eq(tiktokPost.idempotencyKey, input.idempotencyKey),
        ),
      );
    return { created: false, post: (await getPost(input.projectId, existing!.id))! };
  }
}

export async function finishPost(
  projectId: number,
  postId: string,
  outcome: BufferOutcome,
): Promise<PostDto> {
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
    .update(tiktokPost)
    .set({ ...values, updatedAt: new Date() })
    .where(and(eq(tiktokPost.projectId, projectId), eq(tiktokPost.id, postId)));
  return (await getPost(projectId, postId))!;
}
