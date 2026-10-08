import { and, desc, eq, gte, ilike, inArray, isNull, lt, lte, or, sql } from 'drizzle-orm';
import {
  db,
  obsidianIngestJob,
  twitterActivity,
  twitterDraftSource,
  twitterProfile,
  twitterResearchItem,
  twitterResearchRun,
  twitterResearchRunItem,
  twitterSettings,
  user,
} from '@repo/db';
import { iso, pgErrorCode } from '../shared/lib';
import type { CollectResult, ResearchInput } from './adapters';
import { contentHash, mergeUpdate, type NormalizedItem, type NormalizedProfile } from './normalize';

export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Executor = typeof db | Tx;

export type RunKind = 'research' | 'search' | 'profile' | 'post' | 'ingest';
export type RunStatus = 'queued' | 'running' | 'completed' | 'partial' | 'stopped' | 'failed';
export type NoteKind = 'run' | 'item' | 'profile' | 'draft' | 'published' | 'dashboard';

const MAX_RUN_RETRIES = 3;
const RUN_LEASE_MS = 5 * 60_000;

// ---------------------------------------------------------------- activity

export interface ActivityInput {
  projectId: number;
  event: string;
  summary: string;
  level?: 'info' | 'warning' | 'error';
  correlationId?: string | null;
  subjectType?: string;
  subjectId?: string;
  actorUserId?: string | null;
  detail?: Record<string, unknown>;
}

export async function recordActivity(input: ActivityInput, executor: Executor = db): Promise<void> {
  await executor.insert(twitterActivity).values({
    projectId: input.projectId,
    event: input.event,
    summary: input.summary.slice(0, 500),
    level: input.level ?? 'info',
    correlationId: input.correlationId ?? null,
    subjectType: input.subjectType ?? null,
    subjectId: input.subjectId ?? null,
    actorUserId: input.actorUserId ?? null,
    detail: input.detail ?? {},
  });
}

export async function listActivity(
  projectId: number,
  filters: { limit: number; level?: string; event?: string; correlationId?: string },
) {
  const where = [eq(twitterActivity.projectId, projectId)];
  if (filters.level) where.push(eq(twitterActivity.level, filters.level));
  if (filters.event)
    where.push(ilike(twitterActivity.event, `${filters.event.replace(/[%_]/g, '')}%`));
  if (filters.correlationId) where.push(eq(twitterActivity.correlationId, filters.correlationId));
  const rows = await db
    .select({
      id: twitterActivity.id,
      event: twitterActivity.event,
      level: twitterActivity.level,
      correlationId: twitterActivity.correlationId,
      subjectType: twitterActivity.subjectType,
      subjectId: twitterActivity.subjectId,
      actorName: user.name,
      summary: twitterActivity.summary,
      detail: twitterActivity.detail,
      createdAt: twitterActivity.createdAt,
    })
    .from(twitterActivity)
    .leftJoin(user, eq(user.id, twitterActivity.actorUserId))
    .where(and(...where))
    .orderBy(desc(twitterActivity.createdAt), desc(twitterActivity.id))
    .limit(filters.limit);
  return rows.map((row) => ({ ...row, createdAt: iso(row.createdAt) }));
}

// ---------------------------------------------------------------- outbox

// Requests an Obsidian note in the caller's transaction. The note is rendered
// from the rows when the job runs, so requesting it again only resets the job.
export async function requestNote(
  executor: Executor,
  projectId: number,
  kind: NoteKind,
  refId: string,
  correlationId: string | null,
): Promise<void> {
  await executor
    .insert(obsidianIngestJob)
    .values({ projectId, kind, refId, correlationId })
    .onConflictDoUpdate({
      target: [obsidianIngestJob.projectId, obsidianIngestJob.kind, obsidianIngestJob.refId],
      set: {
        status: 'pending',
        attempts: 0,
        nextAttemptAt: new Date(),
        leaseUntil: null,
        lastError: null,
        correlationId: sql`coalesce(excluded.correlation_id, ${obsidianIngestJob.correlationId})`,
        updatedAt: new Date(),
      },
    });
}

export async function retryFailedNotes(projectId: number): Promise<number> {
  const rows = await db
    .update(obsidianIngestJob)
    .set({
      status: 'pending',
      attempts: 0,
      nextAttemptAt: new Date(),
      lastError: null,
      updatedAt: new Date(),
    })
    .where(and(eq(obsidianIngestJob.projectId, projectId), eq(obsidianIngestJob.status, 'failed')))
    .returning({ id: obsidianIngestJob.id });
  return rows.length;
}

export async function noteStatusCounts(projectId: number) {
  const rows = await db
    .select({ status: obsidianIngestJob.status, count: sql<number>`count(*)::int` })
    .from(obsidianIngestJob)
    .where(eq(obsidianIngestJob.projectId, projectId))
    .groupBy(obsidianIngestJob.status);
  const counts = { pending: 0, written: 0, failed: 0 };
  for (const row of rows) counts[row.status as keyof typeof counts] = row.count;
  return counts;
}

// ---------------------------------------------------------------- settings

export interface TwitterSettingsDto {
  bufferChannelId: string | null;
  defaultLanguage: string;
  defaultTimezone: string;
  maxResults: number;
  retentionDays: number;
  toneOfVoice: string;
}

const DEFAULT_SETTINGS: TwitterSettingsDto = {
  bufferChannelId: null,
  defaultLanguage: 'en',
  defaultTimezone: 'Europe/Amsterdam',
  maxResults: 25,
  retentionDays: 90,
  toneOfVoice: '',
};

export async function getSettings(projectId: number): Promise<TwitterSettingsDto> {
  const [row] = await db
    .select()
    .from(twitterSettings)
    .where(eq(twitterSettings.projectId, projectId));
  if (!row) return { ...DEFAULT_SETTINGS };
  return {
    bufferChannelId: row.bufferChannelId,
    defaultLanguage: row.defaultLanguage,
    defaultTimezone: row.defaultTimezone,
    maxResults: row.maxResults,
    retentionDays: row.retentionDays,
    toneOfVoice: row.toneOfVoice,
  };
}

export async function updateSettings(
  projectId: number,
  patch: Partial<TwitterSettingsDto>,
): Promise<TwitterSettingsDto> {
  const next = { ...(await getSettings(projectId)), ...patch };
  await db
    .insert(twitterSettings)
    .values({ projectId, ...next })
    .onConflictDoUpdate({
      target: twitterSettings.projectId,
      set: { ...next, updatedAt: new Date() },
    });
  return next;
}

// ---------------------------------------------------------------- runs

export interface RunDto {
  id: string;
  kind: RunKind;
  status: RunStatus;
  step: string | null;
  correlationId: string;
  input: Record<string, unknown>;
  adapters: string[];
  warnings: string[];
  stopReason: string | null;
  lastError: string | null;
  foundCount: number;
  retryCount: number;
  nextAttemptAt: string | null;
  createdByName: string | null;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  obsidianPath: string | null;
  // The run counts as stored only when its own note and the note of every item
  // it found are confirmed written.
  storage: {
    notes: number;
    written: number;
    pending: number;
    failed: number;
    complete: boolean;
  };
}

const runStorage = sql<{ notes: number; written: number; pending: number; failed: number }>`(
  select json_build_object(
    'notes', count(*)::int,
    'written', count(*) filter (where j.status = 'written')::int,
    'pending', count(*) filter (where j.status = 'pending')::int,
    'failed', count(*) filter (where j.status = 'failed')::int
  )
  from ${obsidianIngestJob} j
  where j.project_id = "twitter_research_run"."project_id"
    and (
      (j.kind = 'run' and j.ref_id = "twitter_research_run"."id"::text)
      or (j.kind = 'item' and j.ref_id in (
        select ri.item_id::text from ${twitterResearchRunItem} ri where ri.run_id = "twitter_research_run"."id"
      ))
    )
)`;

const runColumns = {
  id: twitterResearchRun.id,
  kind: twitterResearchRun.kind,
  status: twitterResearchRun.status,
  step: twitterResearchRun.step,
  correlationId: twitterResearchRun.correlationId,
  input: twitterResearchRun.input,
  adapters: twitterResearchRun.adapters,
  warnings: twitterResearchRun.warnings,
  stopReason: twitterResearchRun.stopReason,
  lastError: twitterResearchRun.lastError,
  foundCount: twitterResearchRun.foundCount,
  retryCount: twitterResearchRun.retryCount,
  nextAttemptAt: twitterResearchRun.nextAttemptAt,
  createdByName: user.name,
  createdAt: twitterResearchRun.createdAt,
  startedAt: twitterResearchRun.startedAt,
  finishedAt: twitterResearchRun.finishedAt,
  obsidianPath: twitterResearchRun.obsidianPath,
  storage: runStorage,
};

type RunRow = {
  [K in keyof typeof runColumns]: unknown;
} & {
  id: string;
  kind: string;
  status: string;
  createdAt: Date;
  nextAttemptAt: Date | null;
  startedAt: Date | null;
  finishedAt: Date | null;
  storage: { notes: number; written: number; pending: number; failed: number } | null;
};

const FINISHED: RunStatus[] = ['completed', 'partial', 'stopped', 'failed'];

function presentRun(row: RunRow): RunDto {
  const storage = row.storage ?? { notes: 0, written: 0, pending: 0, failed: 0 };
  const status = row.status as RunStatus;
  return {
    id: row.id,
    kind: row.kind as RunKind,
    status,
    step: row.step as string | null,
    correlationId: row.correlationId as string,
    input: row.input as Record<string, unknown>,
    adapters: row.adapters as string[],
    warnings: row.warnings as string[],
    stopReason: row.stopReason as string | null,
    lastError: row.lastError as string | null,
    foundCount: row.foundCount as number,
    retryCount: row.retryCount as number,
    nextAttemptAt: row.nextAttemptAt ? iso(row.nextAttemptAt) : null,
    createdByName: row.createdByName as string | null,
    createdAt: iso(row.createdAt),
    startedAt: row.startedAt ? iso(row.startedAt) : null,
    finishedAt: row.finishedAt ? iso(row.finishedAt) : null,
    obsidianPath: row.obsidianPath as string | null,
    storage: {
      ...storage,
      complete: FINISHED.includes(status) && storage.notes > 0 && storage.written === storage.notes,
    },
  };
}

export async function listRuns(projectId: number, limit = 50): Promise<RunDto[]> {
  const rows = await db
    .select(runColumns)
    .from(twitterResearchRun)
    .leftJoin(user, eq(user.id, twitterResearchRun.createdBy))
    .where(eq(twitterResearchRun.projectId, projectId))
    .orderBy(desc(twitterResearchRun.createdAt))
    .limit(limit);
  return rows.map((row) => presentRun(row as RunRow));
}

export async function getRun(projectId: number, runId: string): Promise<RunDto | null> {
  const [row] = await db
    .select(runColumns)
    .from(twitterResearchRun)
    .leftJoin(user, eq(user.id, twitterResearchRun.createdBy))
    .where(and(eq(twitterResearchRun.projectId, projectId), eq(twitterResearchRun.id, runId)));
  return row ? presentRun(row as RunRow) : null;
}

// Creates a run once per idempotency key; a repeated create returns the first.
export async function createRun(input: {
  projectId: number;
  userId: string;
  kind: RunKind;
  request: ResearchInput & Record<string, unknown>;
  idempotencyKey: string;
}): Promise<{ id: string; created: boolean }> {
  try {
    const [row] = await db
      .insert(twitterResearchRun)
      .values({
        projectId: input.projectId,
        kind: input.kind,
        input: input.request,
        idempotencyKey: input.idempotencyKey,
        createdBy: input.userId,
        step: 'queued',
        nextAttemptAt: new Date(),
      })
      .returning({ id: twitterResearchRun.id, correlationId: twitterResearchRun.correlationId });
    await recordActivity({
      projectId: input.projectId,
      event: 'twitter.research.requested',
      summary: `Research requested (${input.kind})`,
      correlationId: row!.correlationId,
      subjectType: 'research_run',
      subjectId: row!.id,
      actorUserId: input.userId,
    });
    return { id: row!.id, created: true };
  } catch (error) {
    if (pgErrorCode(error) !== '23505') throw error;
    const [existing] = await db
      .select({ id: twitterResearchRun.id })
      .from(twitterResearchRun)
      .where(
        and(
          eq(twitterResearchRun.projectId, input.projectId),
          eq(twitterResearchRun.idempotencyKey, input.idempotencyKey),
        ),
      );
    return { id: existing!.id, created: false };
  }
}

export interface ClaimedRun {
  id: string;
  projectId: number;
  kind: RunKind;
  input: ResearchInput;
  correlationId: string;
  retryCount: number;
  createdBy: string | null;
}

// Claims one due run: a queued run whose retry time has come, or a running run
// whose lease ran out (its executor stopped). With `runId`, only that run.
export async function claimRun(runId?: string): Promise<ClaimedRun | null> {
  return db.transaction(async (tx) => {
    const now = new Date();
    const due = or(
      and(
        eq(twitterResearchRun.status, 'queued'),
        or(isNull(twitterResearchRun.nextAttemptAt), lte(twitterResearchRun.nextAttemptAt, now)),
      ),
      and(eq(twitterResearchRun.status, 'running'), lt(twitterResearchRun.leaseUntil, now)),
    );
    const [row] = await tx
      .select()
      .from(twitterResearchRun)
      .where(runId ? and(eq(twitterResearchRun.id, runId), due) : due)
      .orderBy(twitterResearchRun.createdAt)
      .limit(1)
      .for('update', { skipLocked: true });
    if (!row) return null;
    await tx
      .update(twitterResearchRun)
      .set({
        status: 'running',
        step: 'collecting',
        leaseUntil: new Date(now.getTime() + RUN_LEASE_MS),
        startedAt: row.startedAt ?? now,
        updatedAt: now,
      })
      .where(eq(twitterResearchRun.id, row.id));
    await recordActivity(
      {
        projectId: row.projectId,
        event: 'twitter.research.started',
        summary:
          row.retryCount > 0 ? `Research started (retry ${row.retryCount})` : 'Research started',
        correlationId: row.correlationId,
        subjectType: 'research_run',
        subjectId: row.id,
      },
      tx,
    );
    return {
      id: row.id,
      projectId: row.projectId,
      kind: row.kind as RunKind,
      input: row.input as unknown as ResearchInput,
      correlationId: row.correlationId,
      retryCount: row.retryCount,
      createdBy: row.createdBy,
    };
  });
}

type ItemRow = typeof twitterResearchItem.$inferSelect;

async function findExistingItem(tx: Tx, projectId: number, entry: NormalizedItem, hash: string) {
  const scoped = (condition: ReturnType<typeof eq>) =>
    tx
      .select()
      .from(twitterResearchItem)
      .where(and(eq(twitterResearchItem.projectId, projectId), condition))
      .limit(1)
      .for('update');
  if (entry.postId) {
    const [byPost] = await scoped(eq(twitterResearchItem.postId, entry.postId));
    if (byPost) return byPost;
  }
  const [byUrl] = await scoped(eq(twitterResearchItem.canonicalUrl, entry.canonicalUrl));
  if (byUrl) return byUrl;
  const [byHash] = await scoped(eq(twitterResearchItem.contentHash, hash));
  return byHash ?? null;
}

const union = (a: string[], b: string[]) => [...new Set([...a, ...b])];

// Stores one item with deduplication by post id, URL and content hash, links it
// to the run, and requests its note when it is new or changed.
async function upsertItem(
  tx: Tx,
  run: { id: string; projectId: number; correlationId: string },
  entry: NormalizedItem,
  extra: { query: string | null; tags: string[] },
): Promise<{ id: string; created: boolean; updated: boolean }> {
  const hash = contentHash(entry.authorHandle, entry.text);
  let existing: ItemRow | null = await findExistingItem(tx, run.projectId, entry, hash);
  let created = false;
  let updated = false;
  if (!existing) {
    const [inserted] = await tx
      .insert(twitterResearchItem)
      .values({
        projectId: run.projectId,
        firstRunId: run.id,
        postId: entry.postId,
        canonicalUrl: entry.canonicalUrl,
        contentHash: hash,
        authorHandle: entry.authorHandle,
        authorName: entry.authorName,
        profileUrl: entry.profileUrl,
        text: entry.text,
        publishedAt: entry.publishedAt,
        fetchedAt: entry.fetchedAt,
        language: entry.language,
        metrics: entry.metrics,
        media: entry.media as unknown as Array<Record<string, unknown>>,
        links: entry.links,
        query: extra.query,
        relevance: entry.relevance,
        adapter: entry.adapter,
        verificationStatus: entry.verificationStatus,
        sourceStatus: entry.sourceStatus,
        warnings: entry.warnings,
        tags: extra.tags,
      })
      .onConflictDoNothing()
      .returning();
    if (inserted) {
      existing = inserted;
      created = true;
    } else {
      existing = await findExistingItem(tx, run.projectId, entry, hash);
    }
  }
  if (!existing) throw new Error('A research item could be neither inserted nor found');

  if (!created) {
    const patch = mergeUpdate(
      {
        ...existing,
        media: existing.media,
      },
      entry,
    ) as Partial<ItemRow> | null;
    const tags = union(existing.tags, extra.tags);
    const tagsChanged = tags.length !== existing.tags.length;
    const relevance = !existing.relevance && entry.relevance ? entry.relevance : null;
    if (patch || tagsChanged || relevance) {
      await tx
        .update(twitterResearchItem)
        .set({
          ...(patch ?? {}),
          ...(tagsChanged ? { tags } : {}),
          ...(relevance ? { relevance } : {}),
          updatedAt: new Date(),
        })
        .where(eq(twitterResearchItem.id, existing.id));
      updated = true;
    }
  }
  await tx
    .insert(twitterResearchRunItem)
    .values({ runId: run.id, itemId: existing.id })
    .onConflictDoNothing();
  if (created || updated) {
    await requestNote(tx, run.projectId, 'item', existing.id, run.correlationId);
  }
  return { id: existing.id, created, updated };
}

async function upsertProfile(tx: Tx, projectId: number, profile: NormalizedProfile) {
  const [row] = await tx
    .insert(twitterProfile)
    .values({ projectId, ...profile })
    .onConflictDoUpdate({
      target: [twitterProfile.projectId, twitterProfile.handle],
      set: {
        name: profile.name,
        description: profile.description,
        followers: profile.followers,
        fetchedAt: profile.fetchedAt,
        updatedAt: new Date(),
      },
    })
    .returning({ id: twitterProfile.id });
  return row!.id;
}

async function ensureProfile(tx: Tx, projectId: number, entry: NormalizedItem) {
  const [row] = await tx
    .insert(twitterProfile)
    .values({
      projectId,
      handle: entry.authorHandle,
      name: entry.authorName,
      profileUrl: entry.profileUrl,
      fetchedAt: entry.fetchedAt,
    })
    .onConflictDoNothing()
    .returning({ id: twitterProfile.id });
  return row?.id ?? null;
}

// Stores what a run collected and settles its status. A run left without results
// by timeouts only is queued again with backoff, up to MAX_RUN_RETRIES.
export async function saveRunResults(run: ClaimedRun, result: CollectResult): Promise<RunStatus> {
  return db.transaction(async (tx) => {
    const query =
      typeof run.input.question === 'string' && run.input.question
        ? run.input.question
        : [...run.input.terms, ...run.input.hashtags.map((tag) => `#${tag}`)].join(' ') || null;
    let created = 0;
    let duplicates = 0;
    for (const entry of result.items) {
      const saved = await upsertItem(tx, run, entry, { query, tags: run.input.tags });
      if (saved.created) {
        created += 1;
        await recordActivity(
          {
            projectId: run.projectId,
            event: 'twitter.research.item_discovered',
            summary: `New post by @${entry.authorHandle}`,
            correlationId: run.correlationId,
            subjectType: 'research_item',
            subjectId: saved.id,
            detail: { adapter: entry.adapter, canonicalUrl: entry.canonicalUrl },
          },
          tx,
        );
        const profileId = await ensureProfile(tx, run.projectId, entry);
        if (profileId)
          await requestNote(tx, run.projectId, 'profile', String(profileId), run.correlationId);
      } else {
        duplicates += 1;
      }
    }
    for (const profile of result.profiles) {
      const id = await upsertProfile(tx, run.projectId, profile);
      await requestNote(tx, run.projectId, 'profile', String(id), run.correlationId);
    }

    let status: RunStatus;
    let lastError: string | null = null;
    const onlyTransient =
      result.items.length === 0 &&
      !result.stop &&
      result.transientFailures > 0 &&
      result.transientFailures === result.requests;
    if (onlyTransient && run.retryCount < MAX_RUN_RETRIES) {
      const delayMs = 30_000 * 2 ** run.retryCount;
      await tx
        .update(twitterResearchRun)
        .set({
          status: 'queued',
          step: 'waiting to retry',
          retryCount: run.retryCount + 1,
          nextAttemptAt: new Date(Date.now() + delayMs),
          leaseUntil: null,
          warnings: result.warnings,
          adapters: result.adapters,
          lastError: 'Every request timed out or failed on the server side',
          updatedAt: new Date(),
        })
        .where(eq(twitterResearchRun.id, run.id));
      await recordActivity(
        {
          projectId: run.projectId,
          event: 'twitter.research.retry_scheduled',
          level: 'warning',
          summary: `Research found nothing because of timeouts; retry ${run.retryCount + 1} of ${MAX_RUN_RETRIES} in ${Math.round(delayMs / 1000)}s`,
          correlationId: run.correlationId,
          subjectType: 'research_run',
          subjectId: run.id,
        },
        tx,
      );
      return 'queued';
    }

    if (result.stop) {
      status = 'stopped';
    } else if (result.requests === 0 && result.items.length === 0) {
      status = 'failed';
      lastError = result.warnings.join(' ') || 'No research source could answer this request';
    } else if (onlyTransient) {
      status = 'failed';
      lastError = `Every request failed after ${MAX_RUN_RETRIES} retries`;
    } else if (
      result.transientFailures > 0 ||
      result.warnings.some((w) => /returned \d{3}|no answer/.test(w))
    ) {
      status = 'partial';
    } else {
      status = 'completed';
    }

    await tx
      .update(twitterResearchRun)
      .set({
        status,
        step: status,
        adapters: result.adapters,
        warnings: result.warnings,
        stopReason: result.stop?.message ?? null,
        lastError,
        foundCount: result.items.length,
        leaseUntil: null,
        finishedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(twitterResearchRun.id, run.id));
    await requestNote(tx, run.projectId, 'run', run.id, run.correlationId);
    await requestNote(tx, run.projectId, 'dashboard', 'dashboard', run.correlationId);

    const event =
      status === 'stopped'
        ? 'twitter.research.stopped'
        : status === 'failed'
          ? 'twitter.research.failed'
          : 'twitter.research.completed';
    await recordActivity(
      {
        projectId: run.projectId,
        event,
        level:
          status === 'stopped' || status === 'failed'
            ? 'error'
            : status === 'partial'
              ? 'warning'
              : 'info',
        summary:
          status === 'stopped'
            ? `Research stopped: ${result.stop!.message}`
            : status === 'failed'
              ? `Research failed: ${lastError}`
              : `Research ${status}: ${result.items.length} posts (${created} new, ${duplicates} already in the library)`,
        correlationId: run.correlationId,
        subjectType: 'research_run',
        subjectId: run.id,
        detail: {
          adapters: result.adapters,
          warnings: result.warnings,
          stopReason: result.stop?.reason ?? null,
          created,
          duplicates,
        },
      },
      tx,
    );
    await recordActivity(
      {
        projectId: run.projectId,
        event: 'obsidian.ingest.requested',
        summary: `Obsidian notes requested for the run and ${created} new posts`,
        correlationId: run.correlationId,
        subjectType: 'research_run',
        subjectId: run.id,
      },
      tx,
    );
    return status;
  });
}

export async function failRun(run: ClaimedRun, message: string): Promise<void> {
  await db
    .update(twitterResearchRun)
    .set({
      status: 'failed',
      step: 'failed',
      lastError: message,
      leaseUntil: null,
      finishedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(twitterResearchRun.id, run.id));
  await recordActivity({
    projectId: run.projectId,
    event: 'twitter.research.failed',
    level: 'error',
    summary: `Research failed: ${message}`,
    correlationId: run.correlationId,
    subjectType: 'research_run',
    subjectId: run.id,
  });
}

// ---------------------------------------------------------------- items

export interface ItemDto {
  id: string;
  postId: string | null;
  canonicalUrl: string;
  contentHash: string;
  authorHandle: string;
  authorName: string | null;
  profileUrl: string;
  text: string;
  publishedAt: string | null;
  fetchedAt: string;
  language: string | null;
  metrics: Record<string, number> | null;
  media: Array<Record<string, unknown>>;
  links: string[];
  query: string | null;
  relevance: string | null;
  adapter: string;
  verificationStatus: string;
  sourceStatus: string;
  warnings: string[];
  tags: string[];
  obsidianPath: string | null;
  obsidianStatus: 'pending' | 'written' | 'failed' | null;
  runIds: string[];
  draftIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface ItemFilters {
  q?: string;
  handle?: string;
  tag?: string;
  verification?: string;
  runId?: string;
  query?: string;
  stored?: 'yes' | 'no';
  from?: string;
  to?: string;
  ids?: string[];
  sort?: 'fetched' | 'published' | 'author';
  limit: number;
  offset: number;
}

// Written with the table name in full: Drizzle leaves it out of a query without
// joins, and an unqualified "id" here would resolve to the subquery's own table.
const itemNoteStatus = sql<string | null>`(
  select j.status from ${obsidianIngestJob} j
  where j.project_id = "twitter_research_item"."project_id" and j.kind = 'item'
    and j.ref_id = "twitter_research_item"."id"::text
)`;
const itemRunIds = sql<string[]>`coalesce((
  select array_agg(ri.run_id::text order by ri.created_at) from ${twitterResearchRunItem} ri
  where ri.item_id = "twitter_research_item"."id"
), '{}')`;
const itemDraftIds = sql<string[]>`coalesce((
  select array_agg(ds.draft_id::text) from ${twitterDraftSource} ds
  where ds.item_id = "twitter_research_item"."id"
), '{}')`;

export async function listItems(projectId: number, filters: ItemFilters): Promise<ItemDto[]> {
  const where = [eq(twitterResearchItem.projectId, projectId)];
  if (filters.q) {
    const pattern = `%${filters.q.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
    where.push(
      or(
        ilike(twitterResearchItem.text, pattern),
        ilike(twitterResearchItem.authorHandle, pattern),
        ilike(twitterResearchItem.authorName, pattern),
      )!,
    );
  }
  if (filters.handle)
    where.push(
      eq(twitterResearchItem.authorHandle, filters.handle.replace(/^@/, '').toLowerCase()),
    );
  if (filters.tag)
    where.push(sql`${twitterResearchItem.tags} @> ${JSON.stringify([filters.tag])}::jsonb`);
  if (filters.verification)
    where.push(eq(twitterResearchItem.verificationStatus, filters.verification));
  if (filters.query)
    where.push(ilike(twitterResearchItem.query, `%${filters.query.replace(/[%_\\]/g, '')}%`));
  if (filters.runId) {
    where.push(
      sql`exists (select 1 from ${twitterResearchRunItem} ri where ri.item_id = "twitter_research_item"."id" and ri.run_id = ${filters.runId})`,
    );
  }
  if (filters.stored === 'yes') where.push(sql`${itemNoteStatus} = 'written'`);
  if (filters.stored === 'no') where.push(sql`coalesce(${itemNoteStatus}, '') <> 'written'`);
  if (filters.from)
    where.push(gte(twitterResearchItem.publishedAt, new Date(`${filters.from}T00:00:00Z`)));
  if (filters.to)
    where.push(lte(twitterResearchItem.publishedAt, new Date(`${filters.to}T23:59:59Z`)));
  if (filters.ids)
    where.push(
      inArray(
        twitterResearchItem.id,
        filters.ids.length > 0 ? filters.ids : ['00000000-0000-0000-0000-000000000000'],
      ),
    );

  const order =
    filters.sort === 'published'
      ? [sql`${twitterResearchItem.publishedAt} desc nulls last`]
      : filters.sort === 'author'
        ? [twitterResearchItem.authorHandle, desc(twitterResearchItem.fetchedAt)]
        : [desc(twitterResearchItem.fetchedAt)];

  const rows = await db
    .select({
      item: twitterResearchItem,
      obsidianStatus: itemNoteStatus,
      runIds: itemRunIds,
      draftIds: itemDraftIds,
    })
    .from(twitterResearchItem)
    .where(and(...where))
    .orderBy(...order)
    .limit(filters.limit)
    .offset(filters.offset);
  return rows.map(({ item, obsidianStatus, runIds, draftIds }) => ({
    id: item.id,
    postId: item.postId,
    canonicalUrl: item.canonicalUrl,
    contentHash: item.contentHash,
    authorHandle: item.authorHandle,
    authorName: item.authorName,
    profileUrl: item.profileUrl,
    text: item.text,
    publishedAt: item.publishedAt ? iso(item.publishedAt) : null,
    fetchedAt: iso(item.fetchedAt),
    language: item.language,
    metrics: item.metrics,
    media: item.media,
    links: item.links,
    query: item.query,
    relevance: item.relevance,
    adapter: item.adapter,
    verificationStatus: item.verificationStatus,
    sourceStatus: item.sourceStatus,
    warnings: item.warnings,
    tags: item.tags,
    obsidianPath: item.obsidianPath,
    obsidianStatus: obsidianStatus as ItemDto['obsidianStatus'],
    runIds: runIds ?? [],
    draftIds: draftIds ?? [],
    createdAt: iso(item.createdAt),
    updatedAt: iso(item.updatedAt),
  }));
}

// Bulk changes from the library. Every changed item's note is requested again.
export async function updateItems(input: {
  projectId: number;
  userId: string;
  ids: string[];
  addTags?: string[];
  removeTags?: string[];
  verificationStatus?: 'unverified' | 'verified' | 'disputed';
  relevance?: string | null;
}): Promise<number> {
  return db.transaction(async (tx) => {
    const rows = await tx
      .select()
      .from(twitterResearchItem)
      .where(
        and(
          eq(twitterResearchItem.projectId, input.projectId),
          inArray(twitterResearchItem.id, input.ids),
        ),
      )
      .for('update');
    for (const row of rows) {
      const tags = union(row.tags, input.addTags ?? []).filter(
        (tag) => !(input.removeTags ?? []).includes(tag),
      );
      await tx
        .update(twitterResearchItem)
        .set({
          tags,
          ...(input.verificationStatus ? { verificationStatus: input.verificationStatus } : {}),
          ...(input.relevance !== undefined ? { relevance: input.relevance } : {}),
          updatedAt: new Date(),
        })
        .where(eq(twitterResearchItem.id, row.id));
      await requestNote(tx, input.projectId, 'item', row.id, null);
    }
    if (rows.length > 0) {
      await recordActivity(
        {
          projectId: input.projectId,
          event: 'twitter.library.updated',
          summary: `${rows.length} library items updated`,
          actorUserId: input.userId,
          detail: {
            addTags: input.addTags ?? [],
            removeTags: input.removeTags ?? [],
            verificationStatus: input.verificationStatus ?? null,
          },
        },
        tx,
      );
    }
    return rows.length;
  });
}

export async function listTags(projectId: number): Promise<string[]> {
  const rows = (await db.execute(sql`
    select distinct jsonb_array_elements_text(tags) as tag from ${twitterResearchItem}
    where project_id = ${projectId} order by tag limit 200
  `)) as unknown as Array<{ tag: string }>;
  return rows.map((row) => row.tag);
}

// Deletes activity older than each project's retention (90 days by default).
export async function pruneActivity(): Promise<void> {
  await db.execute(sql`
    delete from ${twitterActivity} a
    where a.created_at < now() - make_interval(days => coalesce(
      (select s.retention_days from ${twitterSettings} s where s.project_id = a.project_id), 90
    ))
  `);
}
