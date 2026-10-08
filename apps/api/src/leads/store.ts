import type { TransactionSql } from 'postgres';
import { HttpError, pgErrorCode } from '../shared/lib';
import { withLeads, type LeadsSql } from './client';
import type { LeadFormat, LeadInput } from './lead-input';

export type RunStatus = 'queued' | 'running' | 'completed' | 'failed';

type Row = Record<string, unknown>;

function isoOrNull(value: unknown): string | null {
  return value == null ? null : new Date(value as string | Date).toISOString();
}

function textOrNull(value: unknown): string | null {
  return value == null ? null : String(value);
}

function mapPlatform(row: Row) {
  return {
    id: String(row.id),
    slug: String(row.slug),
    name: String(row.name),
    active: Boolean(row.active),
    leadFormat: row.lead_format as LeadFormat,
    instructions: String(row.instructions),
    agentId: row.agent_id == null ? null : Number(row.agent_id),
    position: Number(row.position),
    leadCount: Number(row.lead_count ?? 0),
    runCount: Number(row.run_count ?? 0),
    openRunCount: Number(row.open_run_count ?? 0),
    lastRunAt: isoOrNull(row.last_run_at),
    createdAt: isoOrNull(row.created_at)!,
  };
}
export type PlatformRow = ReturnType<typeof mapPlatform>;

function mapRun(row: Row) {
  return {
    id: String(row.id),
    platformId: String(row.platform_id),
    platformSlug: String(row.platform_slug),
    platformName: String(row.platform_name),
    leadFormat: row.platform_lead_format as LeadFormat,
    region: String(row.region),
    niche: String(row.niche),
    scale: String(row.scale),
    keywords: String(row.keywords),
    signal: String(row.signal),
    maxLeads: row.max_leads == null ? null : Number(row.max_leads),
    notes: String(row.notes),
    status: row.status as RunStatus,
    leadCount: Number(row.lead_count),
    error: row.error == null ? null : String(row.error),
    requestedBy: row.requested_by == null ? null : String(row.requested_by),
    createdAt: isoOrNull(row.created_at)!,
    startedAt: isoOrNull(row.started_at),
    completedAt: isoOrNull(row.completed_at),
  };
}
export type RunRow = ReturnType<typeof mapRun>;

function mapLead(row: Row) {
  return {
    id: String(row.id),
    platformId: String(row.platform_id),
    platformSlug: String(row.platform_slug),
    platformName: String(row.platform_name),
    scrapeRunId: row.scrape_run_id == null ? null : String(row.scrape_run_id),
    email: textOrNull(row.email),
    name: String(row.name),
    sector: textOrNull(row.sector),
    handle: textOrNull(row.handle),
    profileUrl: textOrNull(row.profile_url),
    followers: row.followers == null ? null : Number(row.followers),
    comment: textOrNull(row.comment),
    commentedAt: isoOrNull(row.commented_at),
    videoUrl: textOrNull(row.video_url),
    createdAt: isoOrNull(row.created_at)!,
  };
}

// ── Platforms ──

const platformSelect = (sql: LeadsSql) => sql`
  select p.*,
    (select count(*) from scraper.leads l where l.platform_id = p.id)::int as lead_count,
    (select count(*) from scraper.scrape_runs r where r.platform_id = p.id)::int as run_count,
    (select count(*) from scraper.scrape_runs r
      where r.platform_id = p.id and r.status in ('queued', 'running'))::int as open_run_count,
    (select max(r.created_at) from scraper.scrape_runs r where r.platform_id = p.id) as last_run_at
  from scraper.platforms p
`;

// The platforms a project starts with. Google Maps is active; the others are set up
// but stay off until the project turns them on and connects their agent.
const DEFAULT_PLATFORMS = [
  {
    slug: 'google-maps',
    name: 'Google Maps',
    active: true,
    lead_format: 'email',
    instructions:
      'Search Google Maps for businesses that match the niche in the region. Keep only ' +
      'businesses that fit the requested size. Open each business website and its contact ' +
      'page and collect the email address the business publishes there.',
  },
  { slug: 'tiktok', name: 'TikTok', active: false, lead_format: 'social', instructions: '' },
  { slug: 'linkedin', name: 'LinkedIn', active: false, lead_format: 'social', instructions: '' },
  { slug: 'instagram', name: 'Instagram', active: false, lead_format: 'social', instructions: '' },
];

// Lists a project's platforms. A project without any platform gets the defaults first.
export function listPlatforms(projectId: number) {
  return withLeads(async (sql) => {
    const [{ count }] = await sql`
      select count(*)::int as count from scraper.platforms where project_id = ${projectId}
    `;
    if (count === 0) {
      const defaults = DEFAULT_PLATFORMS.map((platform, index) => ({
        project_id: projectId,
        ...platform,
        position: index + 1,
      }));
      await sql`
        insert into scraper.platforms ${sql(defaults)}
        on conflict (project_id, slug) do nothing
      `;
    }
    const rows = await sql`
      ${platformSelect(sql)} where p.project_id = ${projectId}
      order by p.position, p.created_at
    `;
    return rows.map(mapPlatform);
  });
}

export function getPlatform(projectId: number, id: string) {
  return withLeads(async (sql) => {
    const [row] = await sql`
      ${platformSelect(sql)} where p.project_id = ${projectId} and p.id = ${id}::uuid
    `;
    return row ? mapPlatform(row) : null;
  });
}

export function getPlatformByAgentId(projectId: number, agentId: number) {
  return withLeads(async (sql) => {
    const [row] = await sql`
      ${platformSelect(sql)} where p.project_id = ${projectId} and p.agent_id = ${agentId}
    `;
    return row ? mapPlatform(row) : null;
  });
}

export interface PlatformInput {
  slug: string;
  name: string;
  active?: boolean;
  leadFormat?: LeadFormat;
  instructions?: string;
}

function rethrowSlugTaken(error: unknown): never {
  if (pgErrorCode(error) === '23505')
    throw new HttpError(409, 'A platform with this slug already exists');
  throw error;
}

const nextPosition = (sql: LeadsSql | TransactionSql, projectId: number) => sql`
  (select coalesce(max(position), 0) + 1 from scraper.platforms where project_id = ${projectId})
`;

export function createPlatform(projectId: number, input: PlatformInput) {
  return withLeads(async (sql) => {
    try {
      const [row] = await sql`
        insert into scraper.platforms
          (project_id, slug, name, active, lead_format, instructions, position)
        values (
          ${projectId}, ${input.slug}, ${input.name}, ${input.active ?? true},
          ${input.leadFormat ?? 'email'}, ${input.instructions ?? ''},
          ${nextPosition(sql, projectId)}
        )
        returning id
      `;
      return String(row.id);
    } catch (error) {
      rethrowSlugTaken(error);
    }
  });
}

export interface PlatformPatch {
  name?: string;
  active?: boolean;
  leadFormat?: LeadFormat;
  instructions?: string;
  agentId?: number | null;
}

export function updatePlatform(id: string, patch: PlatformPatch) {
  return withLeads(async (sql) => {
    const set: Record<string, unknown> = {};
    if (patch.name !== undefined) set.name = patch.name;
    if (patch.active !== undefined) set.active = patch.active;
    if (patch.leadFormat !== undefined) set.lead_format = patch.leadFormat;
    if (patch.instructions !== undefined) set.instructions = patch.instructions;
    if (patch.agentId !== undefined) set.agent_id = patch.agentId;
    if (Object.keys(set).length === 0) return;
    await sql`
      update scraper.platforms set ${sql(set)}, updated_at = now() where id = ${id}::uuid
    `;
  });
}

export function deletePlatform(id: string) {
  return withLeads(async (sql) => {
    await sql`delete from scraper.platforms where id = ${id}::uuid`;
  });
}

// Creates platforms whose slug is new and updates the name, state and instructions of
// existing ones. The agent link is not part of the CSV: it is set on the platform page.
export function importPlatforms(projectId: number, inputs: PlatformInput[]) {
  return withLeads(async (sql) => {
    let created = 0;
    let updated = 0;
    await sql.begin(async (tx) => {
      for (const input of inputs) {
        const [row] = await tx`
          insert into scraper.platforms
            (project_id, slug, name, active, lead_format, instructions, position)
          values (
            ${projectId}, ${input.slug}, ${input.name}, ${input.active ?? false},
            ${input.leadFormat ?? 'email'}, ${input.instructions ?? ''},
            ${nextPosition(tx, projectId)}
          )
          on conflict (project_id, slug) do update set
            name = excluded.name, active = excluded.active, lead_format = excluded.lead_format,
            instructions = excluded.instructions, updated_at = now()
          returning (xmax = 0) as inserted
        `;
        if (row.inserted) created++;
        else updated++;
      }
    });
    return { created, updated };
  });
}

// ── Scrape runs ──

const runSelect = (sql: LeadsSql) => sql`
  select r.*, p.slug as platform_slug, p.name as platform_name,
    p.lead_format as platform_lead_format
  from scraper.scrape_runs r
  join scraper.platforms p on p.id = r.platform_id
`;

export function listRuns(projectId: number, platformId?: string) {
  return withLeads(async (sql) => {
    const rows = await sql`
      ${runSelect(sql)}
      where p.project_id = ${projectId}
        and (${platformId ?? null}::uuid is null or r.platform_id = ${platformId ?? null}::uuid)
      order by r.created_at desc
      limit 1000
    `;
    return rows.map(mapRun);
  });
}

export function getRun(projectId: number, id: string) {
  return withLeads(async (sql) => {
    const [row] = await sql`
      ${runSelect(sql)} where p.project_id = ${projectId} and r.id = ${id}::uuid
    `;
    return row ? mapRun(row) : null;
  });
}

export interface RunDetails {
  region: string;
  niche: string;
  scale: string;
  keywords: string;
  signal: string;
  maxLeads: number | null;
  notes: string;
}

export interface RunInput extends RunDetails {
  platformId: string;
  requestedBy: string | null;
}

export function createRun(input: RunInput) {
  return withLeads(async (sql) => {
    const [row] = await sql`
      insert into scraper.scrape_runs
        (platform_id, region, niche, scale, keywords, signal, max_leads, notes, requested_by)
      values (${input.platformId}::uuid, ${input.region}, ${input.niche}, ${input.scale},
        ${input.keywords}, ${input.signal}, ${input.maxLeads}, ${input.notes},
        ${input.requestedBy})
      returning id
    `;
    return String(row.id);
  });
}

// Deleting a run either removes its leads or keeps them without a run (the foreign
// key sets scrape_run_id to null).
export function deleteRun(id: string, deleteLeads: boolean) {
  return withLeads(async (sql) => {
    await sql.begin(async (tx) => {
      if (deleteLeads) await tx`delete from scraper.leads where scrape_run_id = ${id}::uuid`;
      await tx`delete from scraper.scrape_runs where id = ${id}::uuid`;
    });
  });
}

export interface ImportedRun extends RunDetails {
  platformSlug: string;
  status: RunStatus;
  leadCount: number;
  createdAt: string | null;
}

// Imported runs are records of earlier scrapes; rows naming an unknown platform are skipped.
export function importRuns(projectId: number, inputs: ImportedRun[]) {
  return withLeads(async (sql) => {
    let created = 0;
    await sql.begin(async (tx) => {
      for (const input of inputs) {
        const result = await tx`
          insert into scraper.scrape_runs
            (platform_id, region, niche, scale, keywords, signal, max_leads, notes,
              status, lead_count, created_at, completed_at)
          select p.id, ${input.region}, ${input.niche}, ${input.scale}, ${input.keywords},
            ${input.signal}, ${input.maxLeads}, ${input.notes}, ${input.status},
            ${input.leadCount}, coalesce(${input.createdAt}::timestamptz, now()),
            case when ${input.status} in ('completed', 'failed')
              then coalesce(${input.createdAt}::timestamptz, now()) end
          from scraper.platforms p
          where p.project_id = ${projectId} and p.slug = ${input.platformSlug}
        `;
        created += result.count;
      }
    });
    return { created, skipped: inputs.length - created };
  });
}

// Jobs the platform's agent still has to finish, oldest first.
export function listOpenRuns(platformId: string) {
  return withLeads(async (sql) => {
    const rows = await sql`
      ${runSelect(sql)}
      where r.platform_id = ${platformId}::uuid and r.status in ('queued', 'running')
      order by r.created_at
      limit 20
    `;
    return rows.map(mapRun);
  });
}

export function markRunRunning(id: string) {
  return withLeads(async (sql) => {
    await sql`
      update scraper.scrape_runs
      set status = 'running', started_at = coalesce(started_at, now())
      where id = ${id}::uuid
    `;
  });
}

export function finishRun(id: string, status: 'completed' | 'failed', error: string | null) {
  return withLeads(async (sql) => {
    await sql`
      update scraper.scrape_runs
      set status = ${status}, error = ${error}, completed_at = now(),
        started_at = coalesce(started_at, now())
      where id = ${id}::uuid
    `;
  });
}

// ── Leads ──

export function listLeads(projectId: number, filter: { platformId?: string; runId?: string }) {
  return withLeads(async (sql) => {
    const platformId = filter.platformId ?? null;
    const runId = filter.runId ?? null;
    const rows = await sql`
      select l.*, p.slug as platform_slug, p.name as platform_name
      from scraper.leads l
      join scraper.platforms p on p.id = l.platform_id
      where p.project_id = ${projectId}
        and (${platformId}::uuid is null or l.platform_id = ${platformId}::uuid)
        and (${runId}::uuid is null or l.scrape_run_id = ${runId}::uuid)
      order by l.sector nulls last, l.name
      limit 10000
    `;
    return rows.map(mapLead);
  });
}

export function deleteLeads(projectId: number, ids: string[]) {
  return withLeads(async (sql) => {
    const result = await sql`
      delete from scraper.leads l using scraper.platforms p
      where p.id = l.platform_id and p.project_id = ${projectId} and l.id = any(${ids}::uuid[])
    `;
    return result.count;
  });
}

// Inserts leads for a platform, optionally as the result of one run. An email or handle
// the platform already has keeps its first row. A run's lead count grows by the rows added.
export function addLeads(platformId: string, leads: LeadInput[], runId: string | null = null) {
  return withLeads(async (sql) => {
    if (leads.length === 0) return 0;
    return sql.begin(async (tx) => {
      const rows = leads.map((lead) => ({
        platform_id: platformId,
        scrape_run_id: runId,
        email: lead.email,
        name: lead.name,
        sector: lead.sector,
        handle: lead.handle,
        profile_url: lead.profileUrl,
        followers: lead.followers,
        comment: lead.comment,
        commented_at: lead.commentedAt,
        video_url: lead.videoUrl,
      }));
      const result = await tx`
        insert into scraper.leads ${tx(rows)}
        on conflict do nothing
      `;
      if (runId) {
        await tx`
          update scraper.scrape_runs set lead_count = lead_count + ${result.count}
          where id = ${runId}::uuid
        `;
      }
      return result.count;
    });
  });
}
