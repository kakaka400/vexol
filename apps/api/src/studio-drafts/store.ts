import { createHash } from 'node:crypto';
import { and, asc, desc, eq } from 'drizzle-orm';
import {
  db,
  hermesConversation,
  studioDraft,
  studioDraftVersion,
  studioPost,
  studioReview,
  studioSchedule,
  user,
} from '@repo/db';
import { HttpError, iso, pgErrorCode } from '../shared/lib';
import { studioImageUrl } from '../studio/dto';

export type StudioDraftStatus =
  'draft' | 'review_requested' | 'approved' | 'rejected' | 'scheduled';

export interface StudioDraftContent {
  caption: string;
  templateSlot: number | null;
  postId: string | null;
}

export interface StudioDraftSummary {
  id: string;
  platform: 'instagram';
  status: StudioDraftStatus;
  currentVersion: number;
  caption: string;
  templateSlot: number | null;
  imageUrl: string | null;
  createdByName: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface StudioDraftDetail extends StudioDraftSummary {
  conversationId: string | null;
  versions: Array<{
    version: number;
    caption: string;
    templateSlot: number | null;
    postId: string | null;
    imageUrl: string | null;
    contentHash: string;
    createdByName: string | null;
    createdAt: string;
    review: {
      decision: 'approved' | 'rejected';
      reason: string | null;
      decidedByName: string | null;
      decidedAt: string;
    } | null;
  }>;
  schedule: {
    version: number;
    scheduledFor: string;
    timezone: string;
    createdByName: string | null;
    createdAt: string;
  } | null;
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

// The hash covers exactly what a reviewer approves, so an approval can later be
// checked against the content it was given for.
function contentHash(content: StudioDraftContent): string {
  return createHash('sha256')
    .update(JSON.stringify([content.caption, content.templateSlot ?? null, content.postId ?? null]))
    .digest('hex');
}

// The internal id of a Studio image, only when it belongs to the project.
async function resolvePost(tx: Tx, projectId: number, publicId: string | null) {
  if (!publicId) return null;
  const [row] = await tx
    .select({ id: studioPost.id })
    .from(studioPost)
    .where(and(eq(studioPost.publicId, publicId), eq(studioPost.projectId, projectId)));
  if (!row) throw new HttpError(404, 'Image not found');
  return row.id;
}

async function insertVersion(
  tx: Tx,
  input: {
    projectId: number;
    draftId: string;
    version: number;
    content: StudioDraftContent;
    userId: string;
  },
) {
  await tx.insert(studioDraftVersion).values({
    draftId: input.draftId,
    version: input.version,
    caption: input.content.caption,
    templateSlot: input.content.templateSlot,
    postId: await resolvePost(tx, input.projectId, input.content.postId),
    contentHash: contentHash(input.content),
    createdBy: input.userId,
  });
}

// Locks the draft row for the rest of the transaction, so two concurrent state
// changes on one draft run one after the other.
async function lockDraft(tx: Tx, projectId: number, draftId: string) {
  const [draft] = await tx
    .select()
    .from(studioDraft)
    .where(and(eq(studioDraft.id, draftId), eq(studioDraft.projectId, projectId)))
    .for('update');
  if (!draft) throw new HttpError(404, 'Draft not found');
  return draft;
}

// A state change names the version the caller saw. Acting on an older version
// would approve or schedule content the caller did not look at.
function assertCurrent(draft: { currentVersion: number }, version: number) {
  if (draft.currentVersion !== version) {
    throw new HttpError(409, 'The draft has a newer version');
  }
}

async function currentVersionId(tx: Tx, draftId: string, version: number): Promise<string> {
  const [row] = await tx
    .select({ id: studioDraftVersion.id })
    .from(studioDraftVersion)
    .where(and(eq(studioDraftVersion.draftId, draftId), eq(studioDraftVersion.version, version)));
  return row!.id;
}

async function setStatus(tx: Tx, draftId: string, status: StudioDraftStatus, version?: number) {
  await tx
    .update(studioDraft)
    .set({
      status,
      ...(version != null ? { currentVersion: version } : {}),
      updatedAt: new Date(),
    })
    .where(eq(studioDraft.id, draftId));
}

export async function createStudioDraft(input: {
  projectId: number;
  userId: string;
  conversationId: string | null;
  idempotencyKey: string;
  content: StudioDraftContent;
}): Promise<string> {
  try {
    return await db.transaction(async (tx) => {
      if (input.conversationId) {
        const [conversation] = await tx
          .select({ id: hermesConversation.id })
          .from(hermesConversation)
          .where(
            and(
              eq(hermesConversation.id, input.conversationId),
              eq(hermesConversation.projectId, input.projectId),
            ),
          );
        if (!conversation) throw new HttpError(404, 'Conversation not found');
      }
      const [draft] = await tx
        .insert(studioDraft)
        .values({
          projectId: input.projectId,
          conversationId: input.conversationId,
          idempotencyKey: input.idempotencyKey,
          createdBy: input.userId,
        })
        .returning({ id: studioDraft.id });
      await insertVersion(tx, {
        projectId: input.projectId,
        draftId: draft!.id,
        version: 1,
        content: input.content,
        userId: input.userId,
      });
      return draft!.id;
    });
  } catch (error) {
    if (pgErrorCode(error) === '23505') throw new HttpError(409, 'Draft already created');
    throw error;
  }
}

// Editing always produces a new version and returns the draft to the draft
// state, so an earlier approval no longer applies to the current content.
export async function addStudioDraftVersion(input: {
  projectId: number;
  draftId: string;
  userId: string;
  baseVersion: number;
  content: StudioDraftContent;
}): Promise<void> {
  await db.transaction(async (tx) => {
    const draft = await lockDraft(tx, input.projectId, input.draftId);
    assertCurrent(draft, input.baseVersion);
    if (draft.status === 'scheduled') throw new HttpError(409, 'A scheduled draft is locked');
    const version = draft.currentVersion + 1;
    await insertVersion(tx, {
      projectId: input.projectId,
      draftId: draft.id,
      version,
      content: input.content,
      userId: input.userId,
    });
    await setStatus(tx, draft.id, 'draft', version);
  });
}

export async function requestStudioDraftReview(
  projectId: number,
  draftId: string,
  version: number,
): Promise<void> {
  await db.transaction(async (tx) => {
    const draft = await lockDraft(tx, projectId, draftId);
    assertCurrent(draft, version);
    if (draft.status !== 'draft') throw new HttpError(409, 'Only a draft can be sent for review');
    await setStatus(tx, draft.id, 'review_requested');
  });
}

export async function reviewStudioDraft(input: {
  projectId: number;
  draftId: string;
  version: number;
  decision: 'approved' | 'rejected';
  reason: string | null;
  userId: string;
}): Promise<void> {
  await db.transaction(async (tx) => {
    const draft = await lockDraft(tx, input.projectId, input.draftId);
    assertCurrent(draft, input.version);
    if (draft.status !== 'review_requested') {
      throw new HttpError(409, 'The draft is not waiting for review');
    }
    await tx.insert(studioReview).values({
      versionId: await currentVersionId(tx, draft.id, input.version),
      decision: input.decision,
      reason: input.reason,
      decidedBy: input.userId,
    });
    await setStatus(tx, draft.id, input.decision);
  });
}

export async function scheduleStudioDraft(input: {
  projectId: number;
  draftId: string;
  version: number;
  scheduledFor: Date;
  timezone: string;
  userId: string;
}): Promise<void> {
  await db.transaction(async (tx) => {
    const draft = await lockDraft(tx, input.projectId, input.draftId);
    assertCurrent(draft, input.version);
    if (draft.status !== 'approved') {
      throw new HttpError(409, 'Only an approved version can be scheduled');
    }
    const [review] = await tx
      .select({ id: studioReview.id })
      .from(studioReview)
      .where(eq(studioReview.versionId, await currentVersionId(tx, draft.id, input.version)));
    await tx.insert(studioSchedule).values({
      reviewId: review!.id,
      scheduledFor: input.scheduledFor,
      timezone: input.timezone,
      createdBy: input.userId,
    });
    await setStatus(tx, draft.id, 'scheduled');
  });
}

function imageUrl(postPublicId: string | null, imageFileId: number | null): string | null {
  return postPublicId && imageFileId != null ? studioImageUrl(postPublicId) : null;
}

async function draftSummaries(projectId: number, draftId?: string): Promise<StudioDraftSummary[]> {
  const where = [eq(studioDraft.projectId, projectId)];
  if (draftId) where.push(eq(studioDraft.id, draftId));
  const rows = await db
    .select({
      id: studioDraft.id,
      platform: studioDraft.platform,
      status: studioDraft.status,
      currentVersion: studioDraft.currentVersion,
      caption: studioDraftVersion.caption,
      templateSlot: studioDraftVersion.templateSlot,
      postPublicId: studioPost.publicId,
      postImageFileId: studioPost.imageFileId,
      createdByName: user.name,
      createdAt: studioDraft.createdAt,
      updatedAt: studioDraft.updatedAt,
    })
    .from(studioDraft)
    .innerJoin(
      studioDraftVersion,
      and(
        eq(studioDraftVersion.draftId, studioDraft.id),
        eq(studioDraftVersion.version, studioDraft.currentVersion),
      ),
    )
    .leftJoin(studioPost, eq(studioPost.id, studioDraftVersion.postId))
    .leftJoin(user, eq(user.id, studioDraft.createdBy))
    .where(and(...where))
    .orderBy(desc(studioDraft.updatedAt))
    .limit(100);
  return rows.map((row) => ({
    id: row.id,
    platform: row.platform as 'instagram',
    status: row.status as StudioDraftStatus,
    currentVersion: row.currentVersion,
    caption: row.caption,
    templateSlot: row.templateSlot,
    imageUrl: imageUrl(row.postPublicId, row.postImageFileId),
    createdByName: row.createdByName,
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  }));
}

export function listStudioDrafts(projectId: number): Promise<StudioDraftSummary[]> {
  return draftSummaries(projectId);
}

export async function getStudioDraft(
  projectId: number,
  draftId: string,
): Promise<StudioDraftDetail | null> {
  const [summary] = await draftSummaries(projectId, draftId);
  if (!summary) return null;
  const [draft] = await db
    .select({ conversationId: studioDraft.conversationId })
    .from(studioDraft)
    .where(eq(studioDraft.id, draftId));

  const versions = await db
    .select({
      version: studioDraftVersion.version,
      caption: studioDraftVersion.caption,
      templateSlot: studioDraftVersion.templateSlot,
      postPublicId: studioPost.publicId,
      postImageFileId: studioPost.imageFileId,
      contentHash: studioDraftVersion.contentHash,
      createdByName: user.name,
      createdAt: studioDraftVersion.createdAt,
    })
    .from(studioDraftVersion)
    .leftJoin(studioPost, eq(studioPost.id, studioDraftVersion.postId))
    .leftJoin(user, eq(user.id, studioDraftVersion.createdBy))
    .where(eq(studioDraftVersion.draftId, draftId))
    .orderBy(asc(studioDraftVersion.version));

  const reviews = await db
    .select({
      version: studioDraftVersion.version,
      decision: studioReview.decision,
      reason: studioReview.reason,
      decidedByName: user.name,
      decidedAt: studioReview.decidedAt,
    })
    .from(studioReview)
    .innerJoin(studioDraftVersion, eq(studioDraftVersion.id, studioReview.versionId))
    .leftJoin(user, eq(user.id, studioReview.decidedBy))
    .where(eq(studioDraftVersion.draftId, draftId));
  const reviewByVersion = new Map(reviews.map((review) => [review.version, review]));

  const [schedule] = await db
    .select({
      version: studioDraftVersion.version,
      scheduledFor: studioSchedule.scheduledFor,
      timezone: studioSchedule.timezone,
      createdByName: user.name,
      createdAt: studioSchedule.createdAt,
    })
    .from(studioSchedule)
    .innerJoin(studioReview, eq(studioReview.id, studioSchedule.reviewId))
    .innerJoin(studioDraftVersion, eq(studioDraftVersion.id, studioReview.versionId))
    .leftJoin(user, eq(user.id, studioSchedule.createdBy))
    .where(eq(studioDraftVersion.draftId, draftId));

  return {
    ...summary,
    conversationId: draft?.conversationId ?? null,
    versions: versions.map((version) => {
      const review = reviewByVersion.get(version.version);
      return {
        version: version.version,
        caption: version.caption,
        templateSlot: version.templateSlot,
        postId: version.postPublicId,
        imageUrl: imageUrl(version.postPublicId, version.postImageFileId),
        contentHash: version.contentHash,
        createdByName: version.createdByName,
        createdAt: iso(version.createdAt),
        review: review
          ? {
              decision: review.decision as 'approved' | 'rejected',
              reason: review.reason,
              decidedByName: review.decidedByName,
              decidedAt: iso(review.decidedAt),
            }
          : null,
      };
    }),
    schedule: schedule
      ? {
          version: schedule.version,
          scheduledFor: iso(schedule.scheduledFor),
          timezone: schedule.timezone,
          createdByName: schedule.createdByName,
          createdAt: iso(schedule.createdAt),
        }
      : null,
  };
}
