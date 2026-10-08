import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'bun:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { agentRun, aiAgent, db, mcpAuditLog } from '@repo/db';
import { eq } from 'drizzle-orm';
import { app } from '../../../app';
import { authedApi } from '../../../__tests__/helpers/app';
import { signUpTestUser } from '../../../__tests__/helpers/auth';
import { resetDb } from '../../../__tests__/helpers/db';
import { TEST_PNG } from '../../../__tests__/helpers/images';
import { resetBobMcpRateLimiter } from '../../rate-limit';

const TOKEN = 'bob-test-token-with-enough-entropy';
const TOOL_NAMES = [
  'get_dashboard_summary',
  'get_command_center',
  'list_projects',
  'get_project',
  'list_tasks',
  'get_task',
  'list_braindump_entries',
  'list_mind_facts',
  'list_competitors',
  'list_competitor_alerts',
  'list_agent_runs',
  'list_studio_templates',
  'list_studio_posts',
  'create_studio_post',
];
const WRITE_TOOLS = ['create_studio_post'];

// A local stand-in for the OpenRouter image API. It records what it was sent and
// answers with a fixed image, so a generation can be checked end to end without
// calling the paid API.
const GENERATED_PNG = Buffer.concat([TEST_PNG, Buffer.from('generated')]);
const openRouterRequests: Array<{ path: string; authorization: string | null; body: unknown }> = [];
let fakeOpenRouter: ReturnType<typeof Bun.serve>;

beforeAll(() => {
  fakeOpenRouter = Bun.serve({
    port: 0,
    async fetch(request) {
      openRouterRequests.push({
        path: new URL(request.url).pathname,
        authorization: request.headers.get('authorization'),
        body: await request.json().catch(() => null),
      });
      return Response.json({
        data: [{ b64_json: GENERATED_PNG.toString('base64'), media_type: 'image/png' }],
      });
    },
  });
});

afterAll(() => fakeOpenRouter.stop(true));

async function provisionBob(permissions?: Record<string, Record<string, boolean>>) {
  const owner = await signUpTestUser();
  const api = authedApi(owner.cookie);
  const created = await api.projects.post({ key: 'VEX', name: 'Vexol' });
  const projectId = created.data!.id;
  await api.projects({ projectKey: 'VEX' }).settings.patch({ mcpEnabled: true });
  const role = await api.projects({ projectKey: 'VEX' }).roles.post({
    name: 'Bob read only',
    permissions: permissions ?? {
      work_items: { read: true },
      dashboards: { read: true },
      braindump: { read: true },
      mind: { read: true },
      competitors: { read: true },
      studio: { read: true, create: true },
    },
  });
  await api.projects({ projectKey: 'VEX' })['ai-agents'].post({
    name: 'Bob',
    username: 'bob-agent',
    kind: 'external',
    roleId: role.data!.id,
  });
  return { api, projectId };
}

function rpc(method: string, params?: unknown, token = TOKEN) {
  return app.handle(
    new Request('http://localhost/mcp/v1/bob', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: crypto.randomUUID(), method, params }),
    }),
  );
}

describe('Bob MCP', () => {
  const original = {
    token: process.env.VEXOL_BOB_MCP_TOKEN,
    projectKey: process.env.VEXOL_BOB_MCP_PROJECT_KEY,
    openRouterBase: process.env.OPENROUTER_BASE_URL,
  };

  beforeEach(async () => {
    process.env.VEXOL_BOB_MCP_TOKEN = TOKEN;
    process.env.VEXOL_BOB_MCP_PROJECT_KEY = 'VEX';
    process.env.OPENROUTER_BASE_URL = `http://localhost:${fakeOpenRouter.port}`;
    openRouterRequests.length = 0;
    resetBobMcpRateLimiter();
    await resetDb();
    // resetDb truncates all 111 tables in the schema, which costs about a second
    // and more under load; bun's 5s default hook timeout is not enough headroom.
  }, 30_000);

  afterEach(() => {
    process.env.VEXOL_BOB_MCP_TOKEN = original.token;
    process.env.VEXOL_BOB_MCP_PROJECT_KEY = original.projectKey;
    process.env.OPENROUTER_BASE_URL = original.openRouterBase;
  });

  it('returns a generic 401 without a bearer credential', async () => {
    const response = await app.handle(
      new Request('http://localhost/mcp/v1/bob', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}',
      }),
    );
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'Unauthorized' });
  });

  it('returns the same generic 401 for a wrong credential', async () => {
    const response = await rpc('initialize', {}, 'wrong-token');
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'Unauthorized' });
  });

  it('answers with JSON and never redirects to the browser login', async () => {
    await provisionBob();
    for (const response of [await rpc('initialize', {}, 'wrong-token'), await rpc('tools/list')]) {
      expect(response.headers.get('content-type')).toContain('application/json');
      expect(response.headers.get('location')).toBeNull();
      expect(await response.text()).not.toContain('<html');
    }
  });

  it('initializes with the real SDK client and marks every tool but one read-only', async () => {
    await provisionBob();
    const transport = new StreamableHTTPClientTransport(new URL('http://localhost/mcp/v1/bob'), {
      requestInit: { headers: { authorization: `Bearer ${TOKEN}` } },
      fetch: (input, init) =>
        app.handle(new Request(input instanceof URL ? input.toString() : input, init)),
    });
    const client = new Client({ name: 'bob-mcp-test', version: '1.0.0' });
    await client.connect(transport);
    const listed = await client.listTools();
    expect(listed.tools.map((tool) => tool.name)).toEqual(TOOL_NAMES);
    expect(
      listed.tools
        .filter((tool) => !WRITE_TOOLS.includes(tool.name))
        .every((tool) => tool.annotations?.readOnlyHint === true),
    ).toBe(true);
    expect(
      listed.tools.find((tool) => tool.name === 'create_studio_post')?.annotations,
    ).toMatchObject({ readOnlyHint: false, destructiveHint: false });

    const projects = await client.callTool({ name: 'list_projects', arguments: {} });
    expect(projects.isError).not.toBe(true);
    expect(projects.structuredContent).toMatchObject({
      items: [{ id: expect.any(Number), name: 'Vexol', status: 'active' }],
      page: 1,
      pageSize: 20,
    });
    await client.close();
  });

  it('reports an unconfigured service identity as 503, not as a refusal', async () => {
    await provisionBob();
    process.env.VEXOL_BOB_MCP_PROJECT_KEY = 'NOSUCHKEY';
    const response = await rpc('tools/call', { name: 'list_projects', arguments: {} });
    expect(response.status).toBe(503);
    expect(response.headers.get('content-type')).toContain('application/json');
    expect(await response.json()).toMatchObject({ error: 'Service unavailable' });
  });

  it('reports a missing bob-agent as 503', async () => {
    const owner = await signUpTestUser();
    const api = authedApi(owner.cookie);
    await api.projects.post({ key: 'VEX', name: 'Vexol' });
    await api.projects({ projectKey: 'VEX' }).settings.patch({ mcpEnabled: true });
    const response = await rpc('tools/call', { name: 'list_projects', arguments: {} });
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ error: 'Service unavailable' });
  });

  it('blocks a project id outside the configured project context', async () => {
    const { api, projectId } = await provisionBob();
    const other = await api.projects.post({ key: 'OTHER', name: 'Other tenant' });
    expect(other.data!.id).not.toBe(projectId);

    const response = await rpc('tools/call', {
      name: 'get_project',
      arguments: { projectId: other.data!.id },
    });
    const body = (await response.json()) as { result: { isError?: boolean; content: unknown[] } };
    expect(body.result.isError).toBe(true);
    expect(JSON.stringify(body)).not.toContain('Other tenant');
  });

  it('determines actor and project scope on the server and audits without the token', async () => {
    const { projectId } = await provisionBob();
    await rpc('tools/call', {
      name: 'get_project',
      arguments: { projectId, actor: 'attacker', projectKey: 'OTHER' },
    });

    const rows = await db.select().from(mcpAuditLog).where(eq(mcpAuditLog.actor, 'bob-agent'));
    expect(rows.length).toBeGreaterThan(0);
    expect(JSON.stringify(rows)).not.toContain(TOKEN);
  });

  it('rejects unknown tools and invalid arguments safely', async () => {
    await provisionBob();
    const unknown = await rpc('tools/call', { name: 'delete_project', arguments: {} });
    expect(JSON.stringify(await unknown.json())).not.toContain('stack');

    const invalid = await rpc('tools/call', {
      name: 'list_projects',
      arguments: { pageSize: 5000 },
    });
    expect(JSON.stringify(await invalid.json())).not.toContain('stack');
  });

  it('enforces the agent project role for each tool', async () => {
    await provisionBob({ work_items: { read: true } });
    const response = await rpc('tools/call', { name: 'list_agent_runs', arguments: {} });
    const body = (await response.json()) as { result: { isError?: boolean } };
    expect(body.result.isError).toBe(true);
  });

  it('lists and reads a task, and hides one from another project', async () => {
    const { api } = await provisionBob();
    const project = await api.projects({ projectKey: 'VEX' }).get();
    const columnId = project.data!.columns[0]!.id;
    const created = await api.projects({ projectKey: 'VEX' }).issues.post({
      title: 'Approve the budget shift',
      columnId,
      priority: 'urgent',
    });
    const taskId = created.data!.id;

    const listed = await rpc('tools/call', {
      name: 'list_tasks',
      arguments: { priority: 'urgent', page: 1, pageSize: 20 },
    });
    const listBody = (await listed.json()) as {
      result: { structuredContent: { items: Record<string, unknown>[]; hasMore: boolean } };
    };
    expect(listBody.result.structuredContent.items).toHaveLength(1);
    expect(listBody.result.structuredContent.items[0]).toMatchObject({
      id: taskId,
      identifier: 'VEX-1',
      title: 'Approve the budget shift',
      priority: 'urgent',
    });
    expect(listBody.result.structuredContent.hasMore).toBe(false);

    const one = await rpc('tools/call', { name: 'get_task', arguments: { taskId } });
    const oneBody = (await one.json()) as {
      result: { structuredContent: Record<string, unknown> };
    };
    expect(oneBody.result.structuredContent).toMatchObject({ id: taskId, identifier: 'VEX-1' });

    // A task id that is not in the configured project reads as missing.
    const foreign = await rpc('tools/call', { name: 'get_task', arguments: { taskId: 999_999 } });
    expect(JSON.stringify(await foreign.json())).toContain('Resource not found');
  });

  it('paginates tasks with a hard page size', async () => {
    const { api } = await provisionBob();
    const project = await api.projects({ projectKey: 'VEX' }).get();
    const columnId = project.data!.columns[0]!.id;
    for (const title of ['One', 'Two', 'Three']) {
      await api.projects({ projectKey: 'VEX' }).issues.post({ title, columnId });
    }
    const first = await rpc('tools/call', {
      name: 'list_tasks',
      arguments: { page: 1, pageSize: 2 },
    });
    const body = (await first.json()) as {
      result: { structuredContent: { items: unknown[]; hasMore: boolean } };
    };
    expect(body.result.structuredContent.items).toHaveLength(2);
    expect(body.result.structuredContent.hasMore).toBe(true);

    // pageSize is capped by the schema, so an oversized request is rejected.
    const oversized = await rpc('tools/call', {
      name: 'list_tasks',
      arguments: { pageSize: 5_000 },
    });
    const rejected = (await oversized.json()) as { result: { isError?: boolean } };
    expect(rejected.result.isError).toBe(true);
  });

  it('reads braindump, mind and competitors', async () => {
    const { api } = await provisionBob();
    await api
      .projects({ projectKey: 'VEX' })
      .braindump.post({ kind: 'idea', body: 'Winter upsell to warm leads', tags: ['revenue'] });
    await api
      .projects({ projectKey: 'VEX' })
      .mind.facts.post({ category: 'goals', title: 'Q2 close rate is 22%' });
    await api
      .projects({ projectKey: 'VEX' })
      .competitors.post({ platform: 'instagram', handle: 'rivalbrand' });

    const dumps = await rpc('tools/call', {
      name: 'list_braindump_entries',
      arguments: { page: 1, pageSize: 20 },
    });
    const dumpBody = (await dumps.json()) as {
      result: { structuredContent: { items: Record<string, unknown>[] } };
    };
    expect(dumpBody.result.structuredContent.items[0]).toMatchObject({
      kind: 'idea',
      title: 'Winter upsell to warm leads',
    });

    const facts = await rpc('tools/call', {
      name: 'list_mind_facts',
      arguments: { category: 'goals' },
    });
    const factBody = (await facts.json()) as {
      result: { structuredContent: { items: Record<string, unknown>[] } };
    };
    expect(factBody.result.structuredContent.items[0]).toMatchObject({
      category: 'goals',
      title: 'Q2 close rate is 22%',
    });

    const rivals = await rpc('tools/call', { name: 'list_competitors', arguments: {} });
    const rivalBody = (await rivals.json()) as {
      result: { structuredContent: { items: Record<string, unknown>[] } };
    };
    expect(rivalBody.result.structuredContent.items[0]).toMatchObject({
      platform: 'instagram',
      handle: 'rivalbrand',
      healthy: false,
    });

    const alerts = await rpc('tools/call', { name: 'list_competitor_alerts', arguments: {} });
    const alertBody = (await alerts.json()) as {
      result: { structuredContent: { items: unknown[] } };
    };
    expect(alertBody.result.structuredContent.items).toEqual([]);
  });

  it('denies the new sections when the role does not grant them', async () => {
    await provisionBob({ work_items: { read: true }, dashboards: { read: true } });
    for (const name of ['list_braindump_entries', 'list_mind_facts', 'list_competitors']) {
      const response = await rpc('tools/call', { name, arguments: {} });
      const body = (await response.json()) as { result: { isError?: boolean } };
      expect(body.result.isError).toBe(true);
    }
  });

  it('returns a safe 429 after the fixed service burst is exhausted', async () => {
    await provisionBob();
    for (let index = 0; index < 20; index += 1) {
      const response = await rpc('tools/list');
      expect(response.status).not.toBe(429);
    }
    const limited = await rpc('tools/list');
    expect(limited.status).toBe(429);
    expect(await limited.json()).toMatchObject({ error: 'Too many requests' });
  });

  it('summarizes projects, tasks and agent runs from this project alone', async () => {
    await provisionBob();
    const response = await rpc('tools/call', {
      name: 'get_dashboard_summary',
      arguments: {},
    });
    const body = (await response.json()) as {
      result: { isError?: boolean; structuredContent: Record<string, unknown> };
    };
    expect(body.result.isError).not.toBe(true);
    expect(body.result.structuredContent).toMatchObject({
      activeProjects: 1,
      openTasks: 0,
      agentRuns: expect.any(Object),
      recentAgentRuns: [],
      recentErrors: [],
    });
    // Lead figures were removed from Bob's read model; nothing may reintroduce them.
    expect(Object.keys(body.result.structuredContent)).not.toContain('leadCampaigns');
    expect(JSON.stringify(body)).not.toContain('lead');
  });

  // The summary used to aggregate the external leads database, so an unreachable
  // leads host turned the whole tool into a generic "Request failed".
  it('still summarizes when the leads database is unreachable', async () => {
    await provisionBob();
    const originalLeadsUrl = process.env.VEXOL_LEADS_DATABASE_URL;
    process.env.VEXOL_LEADS_DATABASE_URL = 'postgres://nobody:nobody@127.0.0.1:1/none';
    try {
      const response = await rpc('tools/call', {
        name: 'get_dashboard_summary',
        arguments: {},
      });
      const body = (await response.json()) as {
        result: { isError?: boolean; structuredContent: Record<string, unknown> };
      };
      expect(body.result.isError).not.toBe(true);
      expect(body.result.structuredContent).toMatchObject({ activeProjects: 1 });
    } finally {
      process.env.VEXOL_LEADS_DATABASE_URL = originalLeadsUrl;
    }
  });
  it('returns a stable sanitized failure without internal detail', async () => {
    await provisionBob();
    // A missing service identity is an internal fault, not a client mistake.
    process.env.VEXOL_BOB_MCP_PROJECT_KEY = '';
    const response = await rpc('tools/call', { name: 'get_dashboard_summary', arguments: {} });
    expect(response.status).toBe(503);
    const raw = JSON.stringify(await response.json());
    expect(raw).toContain('Service unavailable');
    expect(raw).not.toContain(TOKEN);
    expect(raw).not.toMatch(/at .*\.ts:/);
    expect(raw).not.toContain('postgres');
    expect(raw).not.toContain('VEXOL_');
  });

  it('reports no next agent-run page when the last page is exactly full', async () => {
    await provisionBob();
    const [agent] = await db
      .select({ id: aiAgent.id })
      .from(aiAgent)
      .where(eq(aiAgent.username, 'bob-agent'))
      .limit(1);
    await db.insert(agentRun).values([
      { agentId: agent!.id, prompt: 'First run' },
      { agentId: agent!.id, prompt: 'Second run' },
    ]);
    const response = await rpc('tools/call', {
      name: 'list_agent_runs',
      arguments: { page: 2, pageSize: 1 },
    });
    const body = (await response.json()) as {
      result: { structuredContent: { items: unknown[]; hasMore: boolean } };
    };
    expect(body.result.structuredContent.items).toHaveLength(1);
    expect(body.result.structuredContent.hasMore).toBe(false);
  });

  async function callTool(name: string, args: Record<string, unknown> = {}) {
    const response = await rpc('tools/call', { name, arguments: args });
    const body = (await response.json()) as {
      result: {
        isError?: boolean;
        content: Array<{ text: string }>;
        structuredContent?: Record<string, unknown>;
      };
    };
    return body.result;
  }

  function photo(name: string) {
    return new File([TEST_PNG], name, { type: 'image/png' });
  }

  it('lists the six studio templates with whether each has a photo', async () => {
    const { api } = await provisionBob();
    const studio = api.projects({ projectKey: 'VEX' }).studio;
    await studio.templates({ slot: 2 }).patch({ name: 'Quote', description: 'Dark quote card' });
    await studio.templates({ slot: 2 }).photo.post({ file: photo('quote.png') });

    const result = await callTool('list_studio_templates');
    expect(result.isError).not.toBe(true);
    const items = result.structuredContent!.items as Array<Record<string, unknown>>;
    expect(items).toHaveLength(6);
    expect(items[1]).toEqual({
      slot: 2,
      name: 'Quote',
      description: 'Dark quote card',
      hasPhoto: true,
    });
    expect(items[0]).toMatchObject({ slot: 1, hasPhoto: false });
  });

  it('tells the agent why a studio post cannot be generated yet', async () => {
    const { api } = await provisionBob();

    const noPhoto = await callTool('create_studio_post', { slot: 1, instruction: 'Say hello' });
    expect(noPhoto.isError).toBe(true);
    expect(noPhoto.content[0]!.text).toBe('Template 1 has no photo yet');

    await api
      .projects({ projectKey: 'VEX' })
      .studio.templates({ slot: 1 })
      .photo.post({ file: photo('one.png') });
    const noKey = await callTool('create_studio_post', { slot: 1, instruction: 'Say hello' });
    expect(noKey.isError).toBe(true);
    expect(noKey.content[0]!.text).toBe('Connect an OpenRouter integration first');
    expect(openRouterRequests).toHaveLength(0);
  });

  it('rejects a slot outside 1 to 6 and an empty instruction', async () => {
    await provisionBob();
    const badSlot = await callTool('create_studio_post', { slot: 7, instruction: 'x' });
    expect(badSlot.isError).toBe(true);
    const empty = await callTool('create_studio_post', { slot: 1, instruction: '' });
    expect(empty.isError).toBe(true);
    expect(openRouterRequests).toHaveLength(0);
  });

  it('edits a template photo into a new post and serves it publicly', async () => {
    const { api } = await provisionBob();
    const project = api.projects({ projectKey: 'VEX' });
    await project.integrations.post({
      integrationKey: 'openrouter',
      credential: { apiKey: 'test-openrouter-key' },
    });
    await project.studio.templates({ slot: 4 }).patch({ name: 'Launch' });
    await project.studio.templates({ slot: 4 }).photo.post({ file: photo('launch.png') });

    const result = await callTool('create_studio_post', {
      slot: 4,
      instruction: 'Put "Now open" on it',
    });
    expect(result.isError).not.toBe(true);
    const imageUrl = result.structuredContent!.imageUrl as string;
    expect(imageUrl).toContain('/studio/posts/');
    expect(result.structuredContent).toMatchObject({
      slot: 4,
      templateName: 'Launch',
      instruction: 'Put "Now open" on it',
    });

    // The template photo itself went to the model, together with the instruction.
    expect(openRouterRequests).toHaveLength(1);
    const sent = openRouterRequests[0]!;
    expect(sent.path).toBe('/images');
    expect(sent.authorization).toBe('Bearer test-openrouter-key');
    const body = sent.body as {
      model: string;
      prompt: string;
      input_references: Array<{ image_url: { url: string } }>;
    };
    expect(body.model).toBe('google/gemini-3.1-flash-image');
    expect(body.prompt).toContain('Put "Now open" on it');
    expect(body.input_references[0]!.image_url.url).toBe(
      `data:image/png;base64,${TEST_PNG.toString('base64')}`,
    );

    // The image is served without a session, as the bytes the model returned.
    const imagePath = new URL(imageUrl).pathname;
    const image = await app.handle(new Request(`http://localhost${imagePath}`));
    expect(image.status).toBe(200);
    expect(image.headers.get('content-type')).toBe('image/png');
    expect(image.headers.get('x-content-type-options')).toBe('nosniff');
    expect(Buffer.from(await image.arrayBuffer()).equals(GENERATED_PNG)).toBe(true);

    // The dashboard lists it, created by the agent.
    const posts = await project.studio.posts.get();
    expect(posts.data).toHaveLength(1);
    expect(posts.data![0]).toMatchObject({ slot: 4, createdByName: 'Bob' });
    const listed = await callTool('list_studio_posts');
    expect(listed.structuredContent!.items).toHaveLength(1);
  });

  it('refuses to generate without the studio create permission', async () => {
    await provisionBob({ work_items: { read: true }, studio: { read: true } });
    const result = await callTool('create_studio_post', { slot: 1, instruction: 'Say hello' });
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toBe('Resource is not available');
    expect((await callTool('list_studio_templates')).isError).not.toBe(true);
  });
});
