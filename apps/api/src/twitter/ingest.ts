import { and, asc, desc, eq, isNull, lt, lte, or, sql } from 'drizzle-orm';
import {
  db,
  obsidianIngestJob,
  twitterDraft,
  twitterDraftSource,
  twitterProfile,
  twitterPublishJob,
  twitterResearchItem,
  twitterResearchRun,
  twitterResearchRunItem,
  user,
} from '@repo/db';
import { iso } from '../shared/lib';
import { getDraft, versionPayload } from './drafts';
import {
  DASHBOARD_NOTE_PATH,
  draftNotePath,
  itemNotePath,
  profileNotePath,
  publishedNotePath,
  queryLabel,
  renderDashboardNote,
  renderDraftNote,
  renderItemNote,
  renderProfileNote,
  renderPublishedNote,
  renderRunNote,
  runNotePath,
} from './notes';
import { recordActivity, type NoteKind } from './store';
import { VaultError, writeVaultNote } from './vault';

// Executes the Obsidian outbox (obsidian_ingest_job). Each job renders its note
// from the current rows and writes it; the note's path is stored on the row only
// after the write was read back. A failed write is retried with backoff and,
// after MAX_ATTEMPTS or on a permanent error, marked failed and reported in
// Activity, where a person can request it again.

export const MAX_ATTEMPTS = 5;
const LEASE_MS = 2 * 60_000;

export function noteBackoffMs(attempts: number): number {
  const base = Number(process.env.TWITTER_NOTE_RETRY_BASE_MS) || 30_000;
  const window = Math.min(60 * 60_000, base * 2 ** Math.max(0, attempts - 1));
  return Math.floor(window / 2 + Math.random() * (window / 2));
}

type Job = typeof obsidianIngestJob.$inferSelect;

async function claimJobs(limit: number): Promise<Job[]> {
  return db.transaction(async (tx) => {
    const now = new Date();
    const rows = await tx
      .select()
      .from(obsidianIngestJob)
      .where(
        and(
          eq(obsidianIngestJob.status, 'pending'),
          lte(obsidianIngestJob.nextAttemptAt, now),
          or(isNull(obsidianIngestJob.leaseUntil), lt(obsidianIngestJob.leaseUntil, now)),
        ),
      )
      .orderBy(asc(obsidianIngestJob.id))
      .limit(limit)
      .for('update', { skipLocked: true });
    const claimed: Job[] = [];
    for (const row of rows) {
      const [job] = await tx
        .update(obsidianIngestJob)
        .set({
          attempts: row.attempts + 1,
          leaseUntil: new Date(now.getTime() + LEASE_MS),
          updatedAt: now,
        })
        .where(eq(obsidianIngestJob.id, row.id))
        .returning();
      claimed.push(job!);
    }
    return claimed;
  });
}

interface RenderedNote {
  path: string;
  content: string;
  setPath: () => Promise<unknown>;
}

async function renderItem(job: Job): Promise<RenderedNote | null> {
  const [row] = await db
    .select()
    .from(twitterResearchItem)
    .where(
      and(eq(twitterResearchItem.id, job.refId), eq(twitterResearchItem.projectId, job.projectId)),
    );
  if (!row) return null;
  const [run] = row.firstRunId
    ? await db.select().from(twitterResearchRun).where(eq(twitterResearchRun.id, row.firstRunId))
    : [];
  const drafts = await db
    .select({ id: twitterDraftSource.draftId })
    .from(twitterDraftSource)
    .where(eq(twitterDraftSource.itemId, row.id));
  const path = itemNotePath(row);
  return {
    path,
    content: renderItemNote({
      ...row,
      publishedAt: row.publishedAt ? iso(row.publishedAt) : null,
      fetchedAt: iso(row.fetchedAt),
      run: run
        ? {
            id: run.id,
            notePath: runNotePath({ id: run.id, createdAt: iso(run.createdAt), input: run.input }),
            label: queryLabel(run.input),
          }
        : null,
      drafts: drafts.map((draft) => ({
        notePath: draftNotePath(draft.id),
        label: `draft ${draft.id.slice(0, 8)}`,
      })),
    }),
    setPath: () =>
      db
        .update(twitterResearchItem)
        .set({ obsidianPath: path })
        .where(eq(twitterResearchItem.id, row.id)),
  };
}

async function renderProfile(job: Job): Promise<RenderedNote | null> {
  const [profile] = await db
    .select()
    .from(twitterProfile)
    .where(
      and(eq(twitterProfile.id, Number(job.refId)), eq(twitterProfile.projectId, job.projectId)),
    );
  if (!profile) return null;
  const posts = await db
    .select({
      postId: twitterResearchItem.postId,
      contentHash: twitterResearchItem.contentHash,
      text: twitterResearchItem.text,
    })
    .from(twitterResearchItem)
    .where(
      and(
        eq(twitterResearchItem.projectId, job.projectId),
        eq(twitterResearchItem.authorHandle, profile.handle),
      ),
    )
    .orderBy(desc(twitterResearchItem.publishedAt))
    .limit(100);
  const path = profileNotePath(profile.handle);
  return {
    path,
    content: renderProfileNote({
      ...profile,
      fetchedAt: iso(profile.fetchedAt),
      posts: posts.map((post) => ({ notePath: itemNotePath(post), text: post.text })),
    }),
    setPath: () =>
      db
        .update(twitterProfile)
        .set({ obsidianPath: path })
        .where(eq(twitterProfile.id, profile.id)),
  };
}

async function renderRun(job: Job): Promise<RenderedNote | null> {
  const [run] = await db
    .select()
    .from(twitterResearchRun)
    .where(
      and(eq(twitterResearchRun.id, job.refId), eq(twitterResearchRun.projectId, job.projectId)),
    );
  if (!run) return null;
  const items = await db
    .select({
      postId: twitterResearchItem.postId,
      contentHash: twitterResearchItem.contentHash,
      authorHandle: twitterResearchItem.authorHandle,
      text: twitterResearchItem.text,
    })
    .from(twitterResearchRunItem)
    .innerJoin(twitterResearchItem, eq(twitterResearchItem.id, twitterResearchRunItem.itemId))
    .where(eq(twitterResearchRunItem.runId, run.id))
    .orderBy(asc(twitterResearchRunItem.createdAt));
  const path = runNotePath({ id: run.id, createdAt: iso(run.createdAt), input: run.input });
  return {
    path,
    content: renderRunNote({
      ...run,
      createdAt: iso(run.createdAt),
      startedAt: run.startedAt ? iso(run.startedAt) : null,
      finishedAt: run.finishedAt ? iso(run.finishedAt) : null,
      items: items.map((entry) => ({
        notePath: itemNotePath(entry),
        authorHandle: entry.authorHandle,
        text: entry.text,
      })),
    }),
    setPath: () =>
      db
        .update(twitterResearchRun)
        .set({ obsidianPath: path })
        .where(eq(twitterResearchRun.id, run.id)),
  };
}

async function renderDraft(job: Job): Promise<RenderedNote | null> {
  const draft = await getDraft(job.projectId, job.refId);
  if (!draft) return null;
  const path = draftNotePath(draft.id);
  return {
    path,
    content: renderDraftNote({
      ...draft,
      sources: await Promise.all(
        draft.sources.map(async (source) => {
          const [row] = await db
            .select({
              postId: twitterResearchItem.postId,
              contentHash: twitterResearchItem.contentHash,
            })
            .from(twitterResearchItem)
            .where(eq(twitterResearchItem.id, source.id));
          return {
            notePath: itemNotePath(row!),
            authorHandle: source.authorHandle,
            canonicalUrl: source.canonicalUrl,
          };
        }),
      ),
      publications: draft.publications
        .filter((pub) => pub.zernioPostId)
        .map((pub) => ({
          notePath: publishedNotePath(pub),
          status: `${pub.status} (${pub.mode})`,
        })),
    }),
    setPath: () =>
      db.update(twitterDraft).set({ obsidianPath: path }).where(eq(twitterDraft.id, draft.id)),
  };
}

async function renderPublished(job: Job): Promise<RenderedNote | null> {
  const [row] = await db
    .select({ job: twitterPublishJob, confirmedByName: user.name })
    .from(twitterPublishJob)
    .leftJoin(user, eq(user.id, twitterPublishJob.confirmedBy))
    .where(
      and(eq(twitterPublishJob.id, job.refId), eq(twitterPublishJob.projectId, job.projectId)),
    );
  if (!row) return null;
  const payload = await versionPayload(job.projectId, row.job.draftId, row.job.version);
  const path = publishedNotePath(row.job);
  return {
    path,
    content: renderPublishedNote({
      ...row.job,
      scheduledFor: row.job.scheduledFor ? iso(row.job.scheduledFor) : null,
      confirmedAt: iso(row.job.confirmedAt),
      confirmedByName: row.confirmedByName,
      posts: payload.posts,
      draftNotePath: draftNotePath(row.job.draftId),
    }),
    setPath: () =>
      db
        .update(twitterPublishJob)
        .set({ obsidianPath: path })
        .where(eq(twitterPublishJob.id, row.job.id)),
  };
}

async function renderDashboard(job: Job): Promise<RenderedNote> {
  const runs = await db
    .select()
    .from(twitterResearchRun)
    .where(eq(twitterResearchRun.projectId, job.projectId))
    .orderBy(desc(twitterResearchRun.createdAt))
    .limit(30);
  const count = async (
    table: typeof twitterResearchItem | typeof twitterDraft | typeof twitterPublishJob,
  ) => {
    const [row] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(table)
      .where(eq(table.projectId, job.projectId));
    return row?.count ?? 0;
  };
  return {
    path: DASHBOARD_NOTE_PATH,
    content: renderDashboardNote({
      generatedAt: new Date().toISOString(),
      runs: runs.map((run) => ({
        notePath: runNotePath({ id: run.id, createdAt: iso(run.createdAt), input: run.input }),
        label: queryLabel(run.input).slice(0, 60),
        status: run.status,
        createdAt: iso(run.createdAt),
        found: run.foundCount,
      })),
      itemCount: await count(twitterResearchItem),
      draftCount: await count(twitterDraft),
      publishedCount: await count(twitterPublishJob),
    }),
    setPath: async () => {},
  };
}

const RENDERERS: Record<NoteKind, (job: Job) => Promise<RenderedNote | null>> = {
  item: renderItem,
  profile: renderProfile,
  run: renderRun,
  draft: renderDraft,
  published: renderPublished,
  dashboard: renderDashboard,
};

// Item and profile notes are many and routine, so only their failures are logged.
const QUIET_KINDS = new Set<NoteKind>(['item', 'profile', 'dashboard']);

async function settle(job: Job, values: Partial<Job>): Promise<boolean> {
  // A job requested again while it was being written keeps its pending state, so
  // the newer content is written on the next pass.
  const rows = await db
    .update(obsidianIngestJob)
    .set({ ...values, leaseUntil: null, updatedAt: new Date() })
    .where(and(eq(obsidianIngestJob.id, job.id), eq(obsidianIngestJob.updatedAt, job.updatedAt)))
    .returning({ id: obsidianIngestJob.id });
  return rows.length > 0;
}

async function runJob(job: Job): Promise<'written' | 'retry' | 'failed'> {
  const kind = job.kind as NoteKind;
  let note: RenderedNote | null;
  try {
    note = await RENDERERS[kind](job);
    if (!note) throw new VaultError('The record of this note no longer exists', true);
    await writeVaultNote(note.path, note.content);
  } catch (error) {
    const vaultError =
      error instanceof VaultError
        ? error
        : new VaultError(String((error as Error)?.message ?? error), false);
    const permanent = vaultError.permanent || job.attempts >= MAX_ATTEMPTS;
    const delay = noteBackoffMs(job.attempts);
    const settled = await settle(job, {
      status: permanent ? 'failed' : 'pending',
      lastError: vaultError.message,
      nextAttemptAt: new Date(Date.now() + (permanent ? 0 : delay)),
    });
    if (settled) {
      await recordActivity({
        projectId: job.projectId,
        event: permanent ? 'obsidian.ingest.failed' : 'obsidian.ingest.retry_scheduled',
        level: permanent ? 'error' : 'warning',
        summary: permanent
          ? `Obsidian note (${kind}) not written after ${job.attempts} attempts: ${vaultError.message}`
          : `Obsidian note (${kind}) not written: ${vaultError.message}. Attempt ${job.attempts + 1} in ${Math.round(delay / 1000)}s`,
        correlationId: job.correlationId,
        subjectType: kind,
        subjectId: job.refId,
        detail: { attempts: job.attempts },
      });
    }
    return permanent ? 'failed' : 'retry';
  }
  const settled = await settle(job, {
    status: 'written',
    path: note.path,
    lastError: null,
    writtenAt: new Date(),
  });
  await note.setPath();
  if (settled && !QUIET_KINDS.has(kind)) {
    await recordActivity({
      projectId: job.projectId,
      event: 'obsidian.ingest.completed',
      summary: `Obsidian note written: ${note.path}`,
      correlationId: job.correlationId,
      subjectType: kind,
      subjectId: job.refId,
    });
  }
  return 'written';
}

export async function processNoteJobs(limit = 25) {
  const result = { written: 0, retry: 0, failed: 0 };
  for (const job of await claimJobs(limit)) result[await runJob(job)] += 1;
  return result;
}
