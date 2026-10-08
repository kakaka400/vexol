import { createHash } from 'node:crypto';
import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import {
  aiAgent,
  db,
  projectFile,
  studioPost,
  twitterDraft,
  twitterDraftSource,
  twitterDraftVersion,
  twitterPublishJob,
  twitterResearchItem,
  user,
} from '@repo/db';
import { HttpError, iso, pgErrorCode } from '../shared/lib';
import { studioImageUrl } from '../studio/dto';
import { recordActivity, requestNote } from './store';

export type DraftStatus = 'draft' | 'scheduled' | 'published' | 'failed';
export type PublishStatus = 'pending' | 'unknown' | 'scheduled' | 'published' | 'failed';

export interface DraftContent {
  posts: string[];
  tone: string | null;
  // Studio image public ids.
  media: string[];
}

export function draftContentHash(content: DraftContent): string {
  return createHash('sha256')
    .update(JSON.stringify([content.posts, content.tone ?? null, content.media]))
    .digest('hex');
}

export interface PublishJobDto {
  id: string;
  version: number;
  mode: 'now' | 'schedule';
  status: PublishStatus;
  accountId: string;
  accountHandle: string | null;
  scheduledFor: string | null;
  timezone: string;
  bufferPostId: string | null;
  platformPostUrl: string | null;
  lastError: string | null;
  retryCount: number;
  correlationId: string;
  confirmedByName: string | null;
  confirmedAt: string;
  obsidianPath: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DraftDto {
  id: string;
  status: DraftStatus;
  kind: 'single' | 'thread';
  currentVersion: number;
  posts: string[];
  tone: string | null;
  media: Array<{ id: string; imageUrl: string | null; contentType: string | null }>;
  contentHash: string;
  correlationId: string;
  createdByName: string | null;
  createdByAgent: boolean;
  obsidianPath: string | null;
  sources: Array<{
    id: string;
    authorHandle: string;
    canonicalUrl: string;
    text: string;
    verificationStatus: string;
    obsidianPath: string | null;
  }>;
  versions: Array<{
    version: number;
    posts: string[];
    createdByName: string | null;
    createdAt: string;
  }>;
  publications: PublishJobDto[];
  createdAt: string;
  updatedAt: string;
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function assertSources(tx: Tx, projectId: number, itemIds: string[]) {
  if (itemIds.length === 0) return;
  const rows = await tx
    .select({ id: twitterResearchItem.id })
    .from(twitterResearchItem)
    .where(
      and(eq(twitterResearchItem.projectId, projectId), inArray(twitterResearchItem.id, itemIds)),
    );
  if (rows.length !== new Set(itemIds).size) throw new HttpError(404, 'Research item not found');
}

// The Studio images a version attaches, only when they belong to the project.
async function assertMedia(tx: Tx, projectId: number, media: string[]) {
  if (media.length === 0) return;
  const rows = await tx
    .select({ id: studioPost.publicId, fileId: studioPost.imageFileId })
    .from(studioPost)
    .where(and(eq(studioPost.projectId, projectId), inArray(studioPost.publicId, media)));
  if (rows.length !== new Set(media).size || rows.some((row) => row.fileId == null)) {
    throw new HttpError(404, 'Image not found');
  }
}

async function replaceSources(tx: Tx, draftId: string, itemIds: string[]) {
  await tx.delete(twitterDraftSource).where(eq(twitterDraftSource.draftId, draftId));
  if (itemIds.length > 0) {
    await tx
      .insert(twitterDraftSource)
      .values([...new Set(itemIds)].map((itemId) => ({ draftId, itemId })));
  }
}

async function requestSourceNotes(
  tx: Tx,
  projectId: number,
  itemIds: string[],
  correlationId: string,
) {
  // A source note lists the drafts made from it, so it is written again.
  for (const itemId of new Set(itemIds))
    await requestNote(tx, projectId, 'item', itemId, correlationId);
}

export async function createDraft(input: {
  projectId: number;
  userId: string;
  idempotencyKey: string;
  content: DraftContent;
  sourceItemIds: string[];
}): Promise<string> {
  try {
    return await db.transaction(async (tx) => {
      await assertSources(tx, input.projectId, input.sourceItemIds);
      await assertMedia(tx, input.projectId, input.content.media);
      const [draft] = await tx
        .insert(twitterDraft)
        .values({
          projectId: input.projectId,
          idempotencyKey: input.idempotencyKey,
          createdBy: input.userId,
        })
        .returning({ id: twitterDraft.id, correlationId: twitterDraft.correlationId });
      await tx.insert(twitterDraftVersion).values({
        draftId: draft!.id,
        version: 1,
        posts: input.content.posts,
        tone: input.content.tone,
        media: input.content.media,
        contentHash: draftContentHash(input.content),
        createdBy: input.userId,
      });
      await replaceSources(tx, draft!.id, input.sourceItemIds);
      await requestNote(tx, input.projectId, 'draft', draft!.id, draft!.correlationId);
      await requestSourceNotes(tx, input.projectId, input.sourceItemIds, draft!.correlationId);
      await recordActivity(
        {
          projectId: input.projectId,
          event: 'twitter.draft.created',
          summary: `Draft created (${input.content.posts.length > 1 ? `thread of ${input.content.posts.length}` : 'single post'}, ${input.sourceItemIds.length} sources)`,
          correlationId: draft!.correlationId,
          subjectType: 'draft',
          subjectId: draft!.id,
          actorUserId: input.userId,
        },
        tx,
      );
      return draft!.id;
    });
  } catch (error) {
    if (pgErrorCode(error) === '23505') {
      const [existing] = await db
        .select({ id: twitterDraft.id })
        .from(twitterDraft)
        .where(
          and(
            eq(twitterDraft.projectId, input.projectId),
            eq(twitterDraft.idempotencyKey, input.idempotencyKey),
          ),
        );
      if (existing) return existing.id;
    }
    throw error;
  }
}

async function lockDraft(tx: Tx, projectId: number, draftId: string) {
  const [draft] = await tx
    .select()
    .from(twitterDraft)
    .where(and(eq(twitterDraft.id, draftId), eq(twitterDraft.projectId, projectId)))
    .for('update');
  if (!draft) throw new HttpError(404, 'Draft not found');
  return draft;
}

// Saves changed content as the next version. Unchanged content (an autosave with
// nothing new) and a scheduled or published draft are left alone.
export async function reviseDraft(input: {
  projectId: number;
  draftId: string;
  userId: string;
  baseVersion: number;
  content: DraftContent;
  sourceItemIds?: string[];
}): Promise<void> {
  await db.transaction(async (tx) => {
    const draft = await lockDraft(tx, input.projectId, input.draftId);
    if (draft.currentVersion !== input.baseVersion)
      throw new HttpError(409, 'The draft has a newer version');
    if (draft.status === 'scheduled' || draft.status === 'published') {
      throw new HttpError(409, 'A scheduled or published draft is locked');
    }
    await assertMedia(tx, input.projectId, input.content.media);
    if (input.sourceItemIds) await assertSources(tx, input.projectId, input.sourceItemIds);

    const [current] = await tx
      .select({ contentHash: twitterDraftVersion.contentHash })
      .from(twitterDraftVersion)
      .where(
        and(
          eq(twitterDraftVersion.draftId, draft.id),
          eq(twitterDraftVersion.version, draft.currentVersion),
        ),
      );
    const hash = draftContentHash(input.content);
    const contentChanged = current?.contentHash !== hash;
    if (input.sourceItemIds) {
      const previous = await tx
        .select({ itemId: twitterDraftSource.itemId })
        .from(twitterDraftSource)
        .where(eq(twitterDraftSource.draftId, draft.id));
      await replaceSources(tx, draft.id, input.sourceItemIds);
      await requestSourceNotes(
        tx,
        input.projectId,
        [...previous.map((row) => row.itemId), ...input.sourceItemIds],
        draft.correlationId,
      );
    }
    if (!contentChanged && !input.sourceItemIds) return;

    const version = contentChanged ? draft.currentVersion + 1 : draft.currentVersion;
    if (contentChanged) {
      await tx.insert(twitterDraftVersion).values({
        draftId: draft.id,
        version,
        posts: input.content.posts,
        tone: input.content.tone,
        media: input.content.media,
        contentHash: hash,
        createdBy: input.userId,
      });
    }
    await tx
      .update(twitterDraft)
      .set({ currentVersion: version, status: 'draft', updatedAt: new Date() })
      .where(eq(twitterDraft.id, draft.id));
    await requestNote(tx, input.projectId, 'draft', draft.id, draft.correlationId);
    if (contentChanged) {
      await recordActivity(
        {
          projectId: input.projectId,
          event: 'twitter.draft.revised',
          summary: `Draft saved as version ${version}`,
          correlationId: draft.correlationId,
          subjectType: 'draft',
          subjectId: draft.id,
          actorUserId: input.userId,
        },
        tx,
      );
    }
  });
}

const publishColumns = {
  job: twitterPublishJob,
  confirmedByName: user.name,
};

function presentJob(row: {
  job: typeof twitterPublishJob.$inferSelect;
  confirmedByName: string | null;
}): PublishJobDto {
  const job = row.job;
  return {
    id: job.id,
    version: job.version,
    mode: job.mode as 'now' | 'schedule',
    status: job.status as PublishStatus,
    accountId: job.accountId,
    accountHandle: job.accountHandle,
    scheduledFor: job.scheduledFor ? iso(job.scheduledFor) : null,
    timezone: job.timezone,
    bufferPostId: job.bufferPostId,
    platformPostUrl: job.platformPostUrl,
    lastError: job.lastError,
    retryCount: job.retryCount,
    correlationId: job.correlationId,
    confirmedByName: row.confirmedByName,
    confirmedAt: iso(job.confirmedAt),
    obsidianPath: job.obsidianPath,
    createdAt: iso(job.createdAt),
    updatedAt: iso(job.updatedAt),
  };
}

export async function listPublishJobs(
  projectId: number,
  draftId?: string,
): Promise<PublishJobDto[]> {
  const where = [eq(twitterPublishJob.projectId, projectId)];
  if (draftId) where.push(eq(twitterPublishJob.draftId, draftId));
  const rows = await db
    .select(publishColumns)
    .from(twitterPublishJob)
    .leftJoin(user, eq(user.id, twitterPublishJob.confirmedBy))
    .where(and(...where))
    .orderBy(desc(twitterPublishJob.createdAt))
    .limit(100);
  return rows.map(presentJob);
}

export async function getPublishJob(projectId: number, jobId: string) {
  const [row] = await db
    .select({ ...publishColumns, draftId: twitterPublishJob.draftId })
    .from(twitterPublishJob)
    .leftJoin(user, eq(user.id, twitterPublishJob.confirmedBy))
    .where(and(eq(twitterPublishJob.projectId, projectId), eq(twitterPublishJob.id, jobId)));
  return row ? { ...presentJob(row), draftId: row.draftId } : null;
}

export async function listDrafts(projectId: number): Promise<DraftDto[]> {
  const rows = await db
    .select({ id: twitterDraft.id })
    .from(twitterDraft)
    .where(eq(twitterDraft.projectId, projectId))
    .orderBy(desc(twitterDraft.updatedAt))
    .limit(100);
  const drafts = await Promise.all(rows.map((row) => getDraft(projectId, row.id)));
  return drafts.filter((draft): draft is DraftDto => draft != null);
}

export async function getDraft(projectId: number, draftId: string): Promise<DraftDto | null> {
  const [draft] = await db
    .select({ draft: twitterDraft, createdByName: user.name, agentId: aiAgent.id })
    .from(twitterDraft)
    .leftJoin(user, eq(user.id, twitterDraft.createdBy))
    .leftJoin(
      aiAgent,
      and(
        eq(aiAgent.userId, twitterDraft.createdBy),
        eq(aiAgent.projectId, twitterDraft.projectId),
      ),
    )
    .where(and(eq(twitterDraft.id, draftId), eq(twitterDraft.projectId, projectId)));
  if (!draft) return null;

  const versions = await db
    .select({ version: twitterDraftVersion, createdByName: user.name })
    .from(twitterDraftVersion)
    .leftJoin(user, eq(user.id, twitterDraftVersion.createdBy))
    .where(eq(twitterDraftVersion.draftId, draftId))
    .orderBy(asc(twitterDraftVersion.version));
  const current = versions.find(
    (row) => row.version.version === draft.draft.currentVersion,
  )!.version;

  const media =
    current.media.length > 0
      ? await db
          .select({
            id: studioPost.publicId,
            fileId: studioPost.imageFileId,
            contentType: projectFile.contentType,
          })
          .from(studioPost)
          .leftJoin(projectFile, eq(projectFile.id, studioPost.imageFileId))
          .where(
            and(eq(studioPost.projectId, projectId), inArray(studioPost.publicId, current.media)),
          )
      : [];
  const mediaById = new Map(media.map((row) => [row.id, row]));

  const sources = await db
    .select({
      id: twitterResearchItem.id,
      authorHandle: twitterResearchItem.authorHandle,
      canonicalUrl: twitterResearchItem.canonicalUrl,
      text: twitterResearchItem.text,
      verificationStatus: twitterResearchItem.verificationStatus,
      obsidianPath: twitterResearchItem.obsidianPath,
    })
    .from(twitterDraftSource)
    .innerJoin(twitterResearchItem, eq(twitterResearchItem.id, twitterDraftSource.itemId))
    .where(eq(twitterDraftSource.draftId, draftId))
    .orderBy(asc(twitterDraftSource.createdAt));

  return {
    id: draft.draft.id,
    status: draft.draft.status as DraftStatus,
    kind: current.posts.length > 1 ? 'thread' : 'single',
    currentVersion: draft.draft.currentVersion,
    posts: current.posts,
    tone: current.tone,
    media: current.media.map((id) => {
      const row = mediaById.get(id);
      return {
        id,
        imageUrl: row?.fileId != null ? studioImageUrl(id) : null,
        contentType: row?.contentType ?? null,
      };
    }),
    contentHash: current.contentHash,
    correlationId: draft.draft.correlationId,
    createdByName: draft.createdByName,
    createdByAgent: draft.agentId != null,
    obsidianPath: draft.draft.obsidianPath,
    sources,
    versions: versions.map((row) => ({
      version: row.version.version,
      posts: row.version.posts,
      createdByName: row.createdByName,
      createdAt: iso(row.version.createdAt),
    })),
    publications: await listPublishJobs(projectId, draftId),
    createdAt: iso(draft.draft.createdAt),
    updatedAt: iso(draft.draft.updatedAt),
  };
}

// ---------------------------------------------------------------- publishing

export interface PublishRequest {
  projectId: number;
  draftId: string;
  version: number;
  contentHash: string;
  mode: 'now' | 'schedule';
  accountId: string;
  accountHandle: string;
  scheduledFor: Date | null;
  timezone: string;
  userId: string;
}

// The stored state of one publication: one row per draft version. A retry after
// a timeout (`unknown`) must send the same request, and the caller first looks in
// Buffer for the post the unanswered attempt may have created (`unknownSince`);
// a retry after a refusal (`failed`) is a new request.
export async function beginPublish(request: PublishRequest): Promise<{
  jobId: string;
  correlationId: string;
  unknownSince: Date | null;
  alreadyDone: boolean;
}> {
  return db.transaction(async (tx) => {
    const draft = await lockDraft(tx, request.projectId, request.draftId);
    if (draft.currentVersion !== request.version)
      throw new HttpError(409, 'The draft has a newer version');
    const [version] = await tx
      .select({ contentHash: twitterDraftVersion.contentHash })
      .from(twitterDraftVersion)
      .where(
        and(
          eq(twitterDraftVersion.draftId, draft.id),
          eq(twitterDraftVersion.version, request.version),
        ),
      );
    if (version?.contentHash !== request.contentHash) {
      throw new HttpError(409, 'The confirmed preview does not match the current version');
    }

    const key = `${draft.id}:v${request.version}`;
    const [existing] = await tx
      .select()
      .from(twitterPublishJob)
      .where(
        and(
          eq(twitterPublishJob.projectId, request.projectId),
          eq(twitterPublishJob.idempotencyKey, key),
        ),
      )
      .for('update');

    if (existing && (existing.status === 'scheduled' || existing.status === 'published')) {
      return {
        jobId: existing.id,
        correlationId: existing.correlationId,
        unknownSince: null,
        alreadyDone: true,
      };
    }
    if (
      existing &&
      existing.status === 'pending' &&
      Date.now() - existing.updatedAt.getTime() < 120_000
    ) {
      throw new HttpError(409, 'This version is being sent to Buffer right now');
    }
    const sameRequest =
      existing &&
      existing.mode === request.mode &&
      existing.accountId === request.accountId &&
      (existing.scheduledFor?.getTime() ?? null) === (request.scheduledFor?.getTime() ?? null);
    if (existing && existing.status !== 'failed' && !sameRequest) {
      throw new HttpError(
        409,
        'The previous attempt has no confirmed outcome. Retry with the same account and time, or check the post in Buffer first.',
      );
    }

    const now = new Date();
    let job: typeof twitterPublishJob.$inferSelect;
    if (existing) {
      const retryCount =
        existing.status === 'failed' ? existing.retryCount + 1 : existing.retryCount;
      [job] = (await tx
        .update(twitterPublishJob)
        .set({
          status: 'pending',
          mode: request.mode,
          accountId: request.accountId,
          accountHandle: request.accountHandle,
          scheduledFor: request.scheduledFor,
          timezone: request.timezone,
          retryCount,
          lastError: null,
          confirmedBy: request.userId,
          confirmedAt: now,
          updatedAt: now,
        })
        .where(eq(twitterPublishJob.id, existing.id))
        .returning()) as [typeof twitterPublishJob.$inferSelect];
    } else {
      [job] = (await tx
        .insert(twitterPublishJob)
        .values({
          projectId: request.projectId,
          draftId: draft.id,
          version: request.version,
          idempotencyKey: key,
          correlationId: draft.correlationId,
          mode: request.mode,
          accountId: request.accountId,
          accountHandle: request.accountHandle,
          scheduledFor: request.scheduledFor,
          timezone: request.timezone,
          confirmedBy: request.userId,
          confirmedAt: now,
        })
        .returning()) as [typeof twitterPublishJob.$inferSelect];
    }
    await recordActivity(
      {
        projectId: request.projectId,
        event: 'twitter.publish.requested',
        summary:
          request.mode === 'now'
            ? `Publish now to @${request.accountHandle} confirmed`
            : `Schedule for ${request.scheduledFor!.toISOString()} (${request.timezone}) to @${request.accountHandle} confirmed`,
        correlationId: job.correlationId,
        subjectType: 'publish_job',
        subjectId: job.id,
        actorUserId: request.userId,
        detail: {
          version: request.version,
          contentHash: request.contentHash,
          retry: job.retryCount,
        },
      },
      tx,
    );
    return {
      jobId: job.id,
      correlationId: job.correlationId,
      unknownSince: existing?.status === 'unknown' ? existing.confirmedAt : null,
      alreadyDone: false,
    };
  });
}

export async function finishPublish(input: {
  projectId: number;
  jobId: string;
  outcome:
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
  userId: string | null;
}): Promise<void> {
  await db.transaction(async (tx) => {
    const [job] = await tx
      .select()
      .from(twitterPublishJob)
      .where(
        and(
          eq(twitterPublishJob.id, input.jobId),
          eq(twitterPublishJob.projectId, input.projectId),
        ),
      )
      .for('update');
    if (!job) return;
    const outcome = input.outcome;
    const status: PublishStatus =
      outcome.kind === 'accepted'
        ? outcome.status
        : outcome.kind === 'refused'
          ? 'failed'
          : 'unknown';
    await tx
      .update(twitterPublishJob)
      .set({
        status,
        ...(outcome.kind === 'accepted'
          ? {
              bufferPostId: outcome.bufferPostId,
              platformPostUrl: outcome.platformPostUrl,
              response: outcome.response,
            }
          : {}),
        lastError: outcome.kind === 'accepted' ? outcome.error : outcome.error,
        updatedAt: new Date(),
      })
      .where(eq(twitterPublishJob.id, job.id));
    const draftStatus: DraftStatus | null =
      status === 'published'
        ? 'published'
        : status === 'scheduled'
          ? 'scheduled'
          : status === 'failed'
            ? 'failed'
            : null;
    if (draftStatus) {
      await tx
        .update(twitterDraft)
        .set({ status: draftStatus, updatedAt: new Date() })
        .where(eq(twitterDraft.id, job.draftId));
    }
    if (outcome.kind === 'accepted') {
      await requestNote(tx, input.projectId, 'published', job.id, job.correlationId);
    }
    await requestNote(tx, input.projectId, 'draft', job.draftId, job.correlationId);
    await recordActivity(
      {
        projectId: input.projectId,
        event:
          status === 'failed' || status === 'unknown'
            ? 'twitter.publish.failed'
            : 'twitter.publish.completed',
        level: status === 'failed' ? 'error' : status === 'unknown' ? 'warning' : 'info',
        summary:
          status === 'unknown'
            ? `No answer from Buffer: ${outcome.error}. A retry is safe: it first checks Buffer for the post.`
            : status === 'failed'
              ? `Publication failed: ${outcome.kind === 'accepted' ? outcome.error : outcome.error}`
              : status === 'published'
                ? 'Published on X through Buffer'
                : job.mode === 'now'
                  ? 'Accepted by Buffer for publishing'
                  : 'Scheduled in Buffer',
        correlationId: job.correlationId,
        subjectType: 'publish_job',
        subjectId: job.id,
        actorUserId: input.userId,
        detail: outcome.kind === 'accepted' ? { bufferPostId: outcome.bufferPostId } : {},
      },
      tx,
    );
  });
}

// What a version sends: its posts and the public URLs of its images.
export async function versionPayload(projectId: number, draftId: string, version: number) {
  const [row] = await db
    .select({ posts: twitterDraftVersion.posts, media: twitterDraftVersion.media })
    .from(twitterDraftVersion)
    .innerJoin(twitterDraft, eq(twitterDraft.id, twitterDraftVersion.draftId))
    .where(
      and(
        eq(twitterDraft.projectId, projectId),
        eq(twitterDraftVersion.draftId, draftId),
        eq(twitterDraftVersion.version, version),
      ),
    );
  if (!row) throw new HttpError(404, 'Draft version not found');
  return { posts: row.posts, images: row.media.map((id) => studioImageUrl(id)) };
}
