import { Elysia, t } from 'elysia';
import { guards } from '../shared/guards';
import { authContext } from '../shared/auth-context';
import { noContent } from '../shared/http';
import { HttpError } from '../shared/lib';
import { ErrorResponse } from '../shared/responses';
import { mcpTool } from '../mcp/generate';
import { parseCsvRecords } from './csv';
import { parseCount, toLeadInputs } from './lead-input';
import {
  callerPlatform,
  connectPlatformAgent,
  deletePlatformAgent,
  leadFormatRules,
  platformAgents,
  renamePlatformAgent,
  type PlatformAgent,
} from './platform-agent';
import {
  addLeads,
  createPlatform,
  createRun,
  deleteLeads,
  deletePlatform,
  deleteRun,
  finishRun,
  getPlatform,
  getRun,
  importPlatforms,
  importRuns,
  listLeads,
  listOpenRuns,
  listPlatforms,
  listRuns,
  markRunRunning,
  updatePlatform,
  type ImportedRun,
  type PlatformRow,
  type RunStatus,
} from './store';

const SLUG = '^[a-z0-9]+(-[a-z0-9]+)*$';
const RUN_STATUSES = ['queued', 'running', 'completed', 'failed'] as const satisfies RunStatus[];
const LEAD_FORMATS = ['email', 'social'] as const;
// An optional t.UnionEnum is filled with its first value when absent; a union of literals is not.
const LeadFormatInput = t.Union([t.Literal('email'), t.Literal('social')]);
const MAX_IMPORT_LEADS = 10_000;

const projectParams = t.Object({ projectKey: t.String() });
const platformParams = t.Object({
  projectKey: t.String(),
  platformId: t.String({ format: 'uuid' }),
});
const runParams = t.Object({
  projectKey: t.String(),
  runId: t.String({ format: 'uuid', description: 'Job id from list_scrape_jobs.' }),
});
const csvBody = t.String({ minLength: 1, maxLength: 5_000_000 });

const AgentResponse = t.Nullable(
  t.Object({
    id: t.Number(),
    name: t.String(),
    username: t.String(),
    apiKeyStart: t.Nullable(t.String()),
  }),
);

const PlatformResponse = t.Object({
  id: t.String(),
  slug: t.String(),
  name: t.String(),
  active: t.Boolean(),
  leadFormat: t.UnionEnum(LEAD_FORMATS),
  instructions: t.String(),
  agent: AgentResponse,
  leadCount: t.Number(),
  runCount: t.Number(),
  openRunCount: t.Number(),
  lastRunAt: t.Nullable(t.String()),
  createdAt: t.String(),
});

const PlatformWithKeyResponse = t.Object({ platform: PlatformResponse, apiKey: t.String() });

const runDetailFields = {
  region: t.String(),
  niche: t.String(),
  scale: t.String(),
  keywords: t.String(),
  signal: t.String(),
  maxLeads: t.Nullable(t.Number()),
  notes: t.String(),
};

const RunResponse = t.Object({
  id: t.String(),
  platformId: t.String(),
  platformSlug: t.String(),
  platformName: t.String(),
  leadFormat: t.UnionEnum(LEAD_FORMATS),
  ...runDetailFields,
  status: t.UnionEnum(RUN_STATUSES),
  leadCount: t.Number(),
  error: t.Nullable(t.String()),
  requestedBy: t.Nullable(t.String()),
  createdAt: t.String(),
  startedAt: t.Nullable(t.String()),
  completedAt: t.Nullable(t.String()),
});

const JobResponse = t.Object({
  id: t.String(),
  status: t.UnionEnum(RUN_STATUSES),
  leadFormat: t.UnionEnum(LEAD_FORMATS),
  ...runDetailFields,
  leadCount: t.Number(),
  createdAt: t.String(),
  instructions: t.String(),
  formatRules: t.String(),
});

const LeadResponse = t.Object({
  id: t.String(),
  platformId: t.String(),
  platformSlug: t.String(),
  platformName: t.String(),
  scrapeRunId: t.Nullable(t.String()),
  email: t.Nullable(t.String()),
  name: t.String(),
  sector: t.Nullable(t.String()),
  handle: t.Nullable(t.String()),
  profileUrl: t.Nullable(t.String()),
  followers: t.Nullable(t.Number()),
  comment: t.Nullable(t.String()),
  commentedAt: t.Nullable(t.String()),
  videoUrl: t.Nullable(t.String()),
  createdAt: t.String(),
});

const optionalText = (description: string) =>
  t.Optional(t.String({ maxLength: 2000, description }));

// One lead submitted by an agent. Which fields count depends on the platform's lead format.
const SubmittedLead = t.Object({
  email: optionalText('Email lead: the published email address.'),
  name: optionalText('Email lead: company name. Social lead: display name.'),
  sector: optionalText('Short sector or topic.'),
  handle: optionalText('Social lead: username without @.'),
  profileUrl: optionalText('Social lead: link to the account.'),
  followers: t.Optional(
    t.Union([t.Number(), t.String()], { description: 'Social lead: follower count.' }),
  ),
  comment: optionalText('Social lead: the exact comment text.'),
  commentedAt: optionalText('Social lead: when the comment was placed, ISO 8601.'),
  videoUrl: optionalText('Social lead: link to the video the comment is on.'),
});

const ImportResponse = t.Object({ created: t.Number(), updated: t.Number(), skipped: t.Number() });

const protectedResponses = {
  401: ErrorResponse,
  403: ErrorResponse,
  404: ErrorResponse,
  503: ErrorResponse,
};

function presentPlatform(platform: PlatformRow, agents: Map<number, PlatformAgent>) {
  const { agentId, position: _position, ...rest } = platform;
  return { ...rest, agent: agentId == null ? null : (agents.get(agentId) ?? null) };
}

async function requirePlatform(projectId: number, platformId: string): Promise<PlatformRow> {
  const platform = await getPlatform(projectId, platformId);
  if (!platform) throw new HttpError(404, 'Platform not found');
  return platform;
}

async function platformResponse(projectId: number, platformId: string) {
  return presentPlatform(
    await requirePlatform(projectId, platformId),
    await platformAgents(projectId),
  );
}

// A job tool acts only on a run of the caller's own platform.
async function requireJob(projectId: number, userId: string | undefined, runId: string) {
  const platform = await callerPlatform(projectId, userId);
  const run = await getRun(projectId, runId);
  if (!run || run.platformId !== platform.id) throw new HttpError(404, 'Job not found');
  return run;
}

function parseBoolean(value: string | undefined): boolean {
  return ['true', '1', 'yes', 'ja'].includes((value ?? '').toLowerCase());
}

export const leadRoutes = new Elysia({ name: 'leads', detail: { tags: ['Leads'] } })
  .use(authContext)
  .use(guards)
  // ── Platforms ──
  .get(
    '/projects/:projectKey/leads/platforms',
    async ({ project }) => {
      const [platforms, agents] = await Promise.all([
        listPlatforms(project.id),
        platformAgents(project.id),
      ]);
      return platforms.map((platform) => presentPlatform(platform, agents));
    },
    {
      permission: ['leads', 'read'],
      params: projectParams,
      response: { 200: t.Array(PlatformResponse), ...protectedResponses },
      detail: { summary: 'List the lead scraper platforms with their agent and counts' },
    },
  )
  .post(
    '/projects/:projectKey/leads/platforms',
    async ({ project, body, set }) => {
      const platformId = await createPlatform(project.id, body);
      const { apiKey } = await connectPlatformAgent(
        project.id,
        await requirePlatform(project.id, platformId),
      );
      set.status = 201;
      return { platform: await platformResponse(project.id, platformId), apiKey };
    },
    {
      permission: ['ai_agents', 'create'],
      params: projectParams,
      body: t.Object({
        name: t.String({ minLength: 1, maxLength: 80 }),
        slug: t.String({ minLength: 1, maxLength: 60, pattern: SLUG }),
        active: t.Optional(t.Boolean()),
        leadFormat: t.Optional(LeadFormatInput),
        instructions: t.Optional(t.String({ maxLength: 4000 })),
      }),
      response: {
        201: PlatformWithKeyResponse,
        400: ErrorResponse,
        409: ErrorResponse,
        ...protectedResponses,
      },
      detail: { summary: 'Add a scraper platform and create its agent' },
    },
  )
  .post(
    '/projects/:projectKey/leads/platforms/import',
    async ({ project, body }) => {
      const records = parseCsvRecords(body.csv);
      const inputs = records
        .map((record) => ({
          slug: (record.slug ?? '').toLowerCase(),
          name: record.name ?? '',
          active: parseBoolean(record.active),
          leadFormat: record.lead_format === 'social' ? ('social' as const) : ('email' as const),
          instructions: record.instructions ?? '',
        }))
        .filter((input) => new RegExp(SLUG).test(input.slug) && input.name.length > 0);
      const result = await importPlatforms(project.id, inputs);
      return { ...result, skipped: records.length - inputs.length };
    },
    {
      permission: ['leads', 'create'],
      params: projectParams,
      body: t.Object({ csv: csvBody }),
      response: { 200: ImportResponse, 400: ErrorResponse, ...protectedResponses },
      detail: {
        summary: 'Import platforms from CSV (slug,name,active,lead_format,instructions)',
      },
    },
  )
  .patch(
    '/projects/:projectKey/leads/platforms/:platformId',
    async ({ project, params, body }) => {
      const platform = await requirePlatform(project.id, params.platformId);
      if (body.name !== undefined && body.name !== platform.name) {
        await renamePlatformAgent(project.id, platform, body.name);
      }
      await updatePlatform(platform.id, body);
      return platformResponse(project.id, platform.id);
    },
    {
      permission: ['leads', 'edit'],
      params: platformParams,
      body: t.Object({
        name: t.Optional(t.String({ minLength: 1, maxLength: 80 })),
        active: t.Optional(t.Boolean()),
        leadFormat: t.Optional(LeadFormatInput),
        instructions: t.Optional(t.String({ maxLength: 4000 })),
      }),
      response: { 200: PlatformResponse, 400: ErrorResponse, ...protectedResponses },
      detail: { summary: 'Update a scraper platform' },
    },
  )
  .delete(
    '/projects/:projectKey/leads/platforms/:platformId',
    async ({ project, params }) => {
      const platform = await requirePlatform(project.id, params.platformId);
      await deletePlatformAgent(project.id, platform);
      await deletePlatform(platform.id);
      return noContent();
    },
    {
      permission: ['ai_agents', 'delete'],
      params: platformParams,
      response: { 204: t.Void(), 409: ErrorResponse, ...protectedResponses },
      detail: { summary: 'Delete a platform, its agent, runs and leads' },
    },
  )
  .post(
    '/projects/:projectKey/leads/platforms/:platformId/agent',
    async ({ project, params }) => {
      const { apiKey } = await connectPlatformAgent(
        project.id,
        await requirePlatform(project.id, params.platformId),
      );
      return { platform: await platformResponse(project.id, params.platformId), apiKey };
    },
    {
      permission: ['ai_agents', 'create'],
      params: platformParams,
      response: { 200: PlatformWithKeyResponse, 409: ErrorResponse, ...protectedResponses },
      detail: { summary: "Create a platform's agent" },
    },
  )
  // ── Scrape runs ──
  .get(
    '/projects/:projectKey/leads/runs',
    ({ project, query }) => listRuns(project.id, query.platformId),
    {
      permission: ['leads', 'read'],
      params: projectParams,
      query: t.Object({ platformId: t.Optional(t.String({ format: 'uuid' })) }),
      response: { 200: t.Array(RunResponse), 400: ErrorResponse, ...protectedResponses },
      detail: { summary: 'List scrape runs, newest first' },
    },
  )
  .post(
    '/projects/:projectKey/leads/runs',
    async ({ project, body, user, set }) => {
      const platform = await requirePlatform(project.id, body.platformId);
      if (!platform.active) throw new HttpError(409, `${platform.name} is not active`);
      const agents = await platformAgents(project.id);
      if (platform.agentId == null || !agents.has(platform.agentId)) {
        throw new HttpError(409, `${platform.name} has no agent`);
      }
      const runId = await createRun({
        platformId: platform.id,
        region: body.region.trim(),
        niche: body.niche.trim(),
        scale: body.scale.trim(),
        keywords: body.keywords?.trim() ?? '',
        signal: body.signal?.trim() ?? '',
        maxLeads: body.maxLeads ?? null,
        notes: body.notes?.trim() ?? '',
        requestedBy: user?.name || user?.email || null,
      });
      set.status = 201;
      return (await getRun(project.id, runId))!;
    },
    {
      permission: ['leads', 'create'],
      params: projectParams,
      body: t.Object({
        platformId: t.String({ format: 'uuid' }),
        region: t.String({ minLength: 1, maxLength: 200 }),
        niche: t.String({ minLength: 1, maxLength: 200 }),
        scale: t.String({ minLength: 1, maxLength: 200 }),
        keywords: t.Optional(t.String({ maxLength: 2000 })),
        signal: t.Optional(t.String({ maxLength: 2000 })),
        maxLeads: t.Optional(t.Integer({ minimum: 1, maximum: MAX_IMPORT_LEADS })),
        notes: t.Optional(t.String({ maxLength: 4000 })),
      }),
      response: { 201: RunResponse, 400: ErrorResponse, 409: ErrorResponse, ...protectedResponses },
      detail: { summary: "Queue a scrape for the platform's agent" },
    },
  )
  .post(
    '/projects/:projectKey/leads/runs/import',
    async ({ project, body }) => {
      const records = parseCsvRecords(body.csv);
      const inputs: ImportedRun[] = records.map((record) => {
        const status = (record.status ?? '').toLowerCase() as RunStatus;
        const createdAt = record.created_at ? new Date(record.created_at) : null;
        return {
          platformSlug: (record.platform ?? '').toLowerCase(),
          region: record.region ?? '',
          niche: record.niche ?? '',
          scale: record.scale ?? '',
          keywords: record.keywords ?? '',
          signal: record.signal ?? '',
          maxLeads: parseCount(record.max_leads ?? '') || null,
          notes: record.notes ?? '',
          status: (RUN_STATUSES as readonly string[]).includes(status) ? status : 'completed',
          leadCount: Math.max(0, Math.trunc(Number(record.lead_count) || 0)),
          createdAt: createdAt && !isNaN(createdAt.getTime()) ? createdAt.toISOString() : null,
        };
      });
      const result = await importRuns(project.id, inputs);
      return { created: result.created, updated: 0, skipped: result.skipped };
    },
    {
      permission: ['leads', 'create'],
      params: projectParams,
      body: t.Object({ csv: csvBody }),
      response: { 200: ImportResponse, 400: ErrorResponse, ...protectedResponses },
      detail: {
        summary:
          'Import scrape logs from CSV (created_at,platform,region,niche,scale,keywords,signal,max_leads,notes,status,lead_count)',
      },
    },
  )
  .delete(
    '/projects/:projectKey/leads/runs/:runId',
    async ({ project, params, query }) => {
      if (!(await getRun(project.id, params.runId))) throw new HttpError(404, 'Run not found');
      await deleteRun(params.runId, query.deleteLeads ?? false);
      return noContent();
    },
    {
      permission: ['leads', 'delete'],
      params: runParams,
      query: t.Object({ deleteLeads: t.Optional(t.Boolean()) }),
      response: { 204: t.Void(), 400: ErrorResponse, ...protectedResponses },
      detail: { summary: 'Delete a scrape run, optionally with its leads' },
    },
  )
  // ── Leads ──
  .get('/projects/:projectKey/leads', ({ project, query }) => listLeads(project.id, query), {
    permission: ['leads', 'read'],
    params: projectParams,
    query: t.Object({
      platformId: t.Optional(t.String({ format: 'uuid' })),
      runId: t.Optional(t.String({ format: 'uuid' })),
    }),
    response: { 200: t.Array(LeadResponse), 400: ErrorResponse, ...protectedResponses },
    detail: { summary: 'List leads, ordered by sector and name' },
  })
  .post(
    '/projects/:projectKey/leads/delete',
    async ({ project, body }) => ({ deleted: await deleteLeads(project.id, body.ids) }),
    {
      permission: ['leads', 'delete'],
      params: projectParams,
      body: t.Object({
        ids: t.Array(t.String({ format: 'uuid' }), { minItems: 1, maxItems: MAX_IMPORT_LEADS }),
      }),
      response: {
        200: t.Object({ deleted: t.Number() }),
        400: ErrorResponse,
        ...protectedResponses,
      },
      detail: { summary: 'Delete leads by id' },
    },
  )
  .post(
    '/projects/:projectKey/leads/import',
    async ({ project, body }) => {
      const platform = await requirePlatform(project.id, body.platformId);
      const { leads, skipped } = toLeadInputs(platform.leadFormat, parseCsvRecords(body.csv));
      if (leads.length > MAX_IMPORT_LEADS) {
        throw new HttpError(400, `Import at most ${MAX_IMPORT_LEADS} leads at once`);
      }
      const created = await addLeads(platform.id, leads);
      return { created, updated: 0, skipped: skipped + leads.length - created };
    },
    {
      permission: ['leads', 'create'],
      params: projectParams,
      body: t.Object({ platformId: t.String({ format: 'uuid' }), csv: csvBody }),
      response: { 200: ImportResponse, 400: ErrorResponse, ...protectedResponses },
      detail: {
        summary:
          "Import leads from CSV into a platform, in the platform's lead format: email,name,sector or handle,profile_url,name,followers,comment,commented_at,video_url,sector",
      },
    },
  )
  // ── Agent job tools (MCP) ──
  .get(
    '/projects/:projectKey/leads/jobs',
    async ({ project, user }) => {
      const platform = await callerPlatform(project.id, user?.id);
      const runs = await listOpenRuns(platform.id);
      return runs.map((run) => ({
        id: run.id,
        status: run.status,
        leadFormat: run.leadFormat,
        region: run.region,
        niche: run.niche,
        scale: run.scale,
        keywords: run.keywords,
        signal: run.signal,
        maxLeads: run.maxLeads,
        notes: run.notes,
        leadCount: run.leadCount,
        createdAt: run.createdAt,
        instructions: platform.instructions,
        formatRules: leadFormatRules(run.leadFormat),
      }));
    },
    {
      permission: ['leads', 'read'],
      params: projectParams,
      response: { 200: t.Array(JobResponse), ...protectedResponses },
      detail: {
        summary: 'List the queued and running scrape jobs of your platform',
        description:
          'Returns the scrape jobs waiting for you, oldest first. Each job has a region, niche ' +
          'and size in free text, optional keywords, signal, maxLeads and notes, plus the ' +
          'platform instructions and the rules of its lead format (email or social). ' +
          'Call start_scrape_job, then submit_scrape_leads one or more times, then finish_scrape_job.',
        ...mcpTool('list_scrape_jobs'),
      },
    },
  )
  .post(
    '/projects/:projectKey/leads/jobs/:runId/start',
    async ({ project, params, user }) => {
      await requireJob(project.id, user?.id, params.runId);
      await markRunRunning(params.runId);
      return { ok: true };
    },
    {
      permission: ['leads', 'edit'],
      params: runParams,
      response: { 200: t.Object({ ok: t.Boolean() }), 400: ErrorResponse, ...protectedResponses },
      detail: {
        summary: 'Mark a scrape job as running',
        ...mcpTool('start_scrape_job', { idempotentHint: true }),
      },
    },
  )
  .post(
    '/projects/:projectKey/leads/jobs/:runId/leads',
    async ({ project, params, user, body }) => {
      const run = await requireJob(project.id, user?.id, params.runId);
      if (!body.csv && !body.leads) throw new HttpError(400, 'Send leads or csv');
      const { leads, skipped } = toLeadInputs(run.leadFormat, [
        ...(body.leads ?? []),
        ...(body.csv ? parseCsvRecords(body.csv) : []),
      ]);
      if (leads.length > MAX_IMPORT_LEADS) {
        throw new HttpError(400, `Submit at most ${MAX_IMPORT_LEADS} leads at once`);
      }
      const added = await addLeads(run.platformId, leads, run.id);
      return { added, skipped: skipped + leads.length - added };
    },
    {
      permission: ['leads', 'create'],
      params: runParams,
      body: t.Object({
        leads: t.Optional(
          t.Array(SubmittedLead, {
            maxItems: MAX_IMPORT_LEADS,
            description: 'The leads, one object per lead, following formatRules from the job.',
          }),
        ),
        csv: t.Optional(
          t.String({
            minLength: 1,
            maxLength: 5_000_000,
            description: 'Email leads only: CSV with the header email,name,sector.',
          }),
        ),
      }),
      response: {
        200: t.Object({ added: t.Number(), skipped: t.Number() }),
        400: ErrorResponse,
        ...protectedResponses,
      },
      detail: {
        summary: 'Submit leads found for a scrape job',
        description:
          'Adds leads to the job. Send `leads` (any platform) or `csv` (email platforms). Leads ' +
          'that break the format rules, and emails or accounts the platform already has, are ' +
          'skipped and counted in `skipped`.',
        ...mcpTool('submit_scrape_leads'),
      },
    },
  )
  .post(
    '/projects/:projectKey/leads/jobs/:runId/finish',
    async ({ project, params, user, body }) => {
      await requireJob(project.id, user?.id, params.runId);
      await finishRun(params.runId, body.status, body.error?.trim() || null);
      return { ok: true };
    },
    {
      permission: ['leads', 'edit'],
      params: runParams,
      body: t.Object({
        status: t.UnionEnum(['completed', 'failed']),
        error: t.Optional(
          t.String({ maxLength: 2000, description: 'Why the job failed, when status is failed.' }),
        ),
      }),
      response: { 200: t.Object({ ok: t.Boolean() }), 400: ErrorResponse, ...protectedResponses },
      detail: {
        summary: 'Finish a scrape job as completed or failed',
        ...mcpTool('finish_scrape_job', { idempotentHint: true }),
      },
    },
  );
