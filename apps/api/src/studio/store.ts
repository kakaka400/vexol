import { db, projectFile, studioPost, studioTemplate, user } from '@repo/db';
import { and, desc, eq, sql } from 'drizzle-orm';
import { HttpError, iso, pgErrorCode } from '../shared/lib';

export const TEMPLATE_SLOTS = [1, 2, 3, 4, 5, 6] as const;

export interface StudioTemplateRow {
  slot: number;
  name: string;
  description: string;
  photoId: string | null;
  updatedAt: string | null;
}

export interface StudioPostRow {
  publicId: string;
  projectId: number;
  slot: number;
  templateName: string;
  instruction: string;
  imageId: string | null;
  createdByName: string | null;
  createdAt: string;
}

// All six slots, in order. A slot without a row is empty.
export async function listStudioTemplates(projectId: number): Promise<StudioTemplateRow[]> {
  const rows = await db
    .select({
      slot: studioTemplate.slot,
      name: studioTemplate.name,
      description: studioTemplate.description,
      photoId: projectFile.publicId,
      updatedAt: studioTemplate.updatedAt,
    })
    .from(studioTemplate)
    .leftJoin(projectFile, eq(projectFile.id, studioTemplate.photoFileId))
    .where(eq(studioTemplate.projectId, projectId));
  const bySlot = new Map(rows.map((row) => [row.slot, row]));
  return TEMPLATE_SLOTS.map((slot) => {
    const row = bySlot.get(slot);
    return {
      slot,
      name: row?.name ?? '',
      description: row?.description ?? '',
      photoId: row?.photoId ?? null,
      updatedAt: row ? iso(row.updatedAt) : null,
    };
  });
}

export async function getStudioTemplate(
  projectId: number,
  slot: number,
): Promise<StudioTemplateRow | null> {
  return (await listStudioTemplates(projectId)).find((row) => row.slot === slot) ?? null;
}

// Creates the slot's row on first use, so an empty slot needs no row.
export async function saveStudioTemplate(
  projectId: number,
  slot: number,
  patch: { name?: string; description?: string; photoFileId?: number },
): Promise<void> {
  await db
    .insert(studioTemplate)
    .values({ projectId, slot, ...patch })
    .onConflictDoUpdate({
      target: [studioTemplate.projectId, studioTemplate.slot],
      set: { ...patch, updatedAt: sql`now()` },
    });
}

// What generation needs from a slot: its row id and where its photo is stored.
export async function studioTemplateSource(
  projectId: number,
  slot: number,
): Promise<{
  id: number;
  name: string;
  photoFileId: number | null;
  photoKey: string | null;
  photoType: string | null;
} | null> {
  const [row] = await db
    .select({
      id: studioTemplate.id,
      name: studioTemplate.name,
      photoFileId: studioTemplate.photoFileId,
      photoKey: projectFile.s3Key,
      photoType: projectFile.contentType,
    })
    .from(studioTemplate)
    .leftJoin(projectFile, eq(projectFile.id, studioTemplate.photoFileId))
    .where(and(eq(studioTemplate.projectId, projectId), eq(studioTemplate.slot, slot)));
  return row ?? null;
}

function postQuery() {
  return db
    .select({
      publicId: studioPost.publicId,
      projectId: studioPost.projectId,
      slot: studioTemplate.slot,
      templateName: studioTemplate.name,
      instruction: studioPost.instruction,
      imageId: projectFile.publicId,
      createdByName: user.name,
      createdAt: studioPost.createdAt,
    })
    .from(studioPost)
    .innerJoin(studioTemplate, eq(studioTemplate.id, studioPost.templateId))
    .leftJoin(projectFile, eq(projectFile.id, studioPost.imageFileId))
    .leftJoin(user, eq(user.id, studioPost.createdByUserId));
}

function mapPost(row: Awaited<ReturnType<typeof postQuery>>[number]): StudioPostRow {
  return { ...row, createdAt: iso(row.createdAt) };
}

export async function listStudioPosts(projectId: number, limit = 100): Promise<StudioPostRow[]> {
  const rows = await postQuery()
    .where(eq(studioPost.projectId, projectId))
    .orderBy(desc(studioPost.createdAt), desc(studioPost.id))
    .limit(limit);
  return rows.map(mapPost);
}

export async function getStudioPost(publicId: string): Promise<StudioPostRow | null> {
  const [row] = await postQuery().where(eq(studioPost.publicId, publicId));
  return row ? mapPost(row) : null;
}

export async function getStudioPostProjectId(publicId: string): Promise<number | null> {
  const [row] = await db
    .select({ projectId: studioPost.projectId })
    .from(studioPost)
    .where(eq(studioPost.publicId, publicId));
  return row?.projectId ?? null;
}

// Where the image of a post is stored, for the public image route.
export async function studioPostImage(
  publicId: string,
): Promise<{ key: string; contentType: string } | null> {
  const [row] = await db
    .select({ key: projectFile.s3Key, contentType: projectFile.contentType })
    .from(studioPost)
    .innerJoin(projectFile, eq(projectFile.id, studioPost.imageFileId))
    .where(eq(studioPost.publicId, publicId));
  return row ?? null;
}

export async function createStudioPost(input: {
  projectId: number;
  templateId: number;
  instruction: string;
  imageFileId: number;
  createdByUserId: string | null;
}): Promise<StudioPostRow> {
  const [created] = await db
    .insert(studioPost)
    .values(input)
    .returning({ publicId: studioPost.publicId });
  const row = await getStudioPost(created.publicId);
  if (!row) throw new Error('Created studio post could not be loaded');
  return row;
}

// Removes the post and returns the id of its image file, so the caller can purge it.
export async function deleteStudioPost(publicId: string): Promise<{ imageFileId: number | null }> {
  try {
    const [row] = await db
      .delete(studioPost)
      .where(eq(studioPost.publicId, publicId))
      .returning({ imageFileId: studioPost.imageFileId });
    return { imageFileId: row?.imageFileId ?? null };
  } catch (error) {
    if (pgErrorCode(error) === '23503') throw new HttpError(409, 'The image is used by a draft');
    throw error;
  }
}
