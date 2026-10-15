import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { app } from '../../../app';
import { authedApi, type Api } from '../../../__tests__/helpers/app';
import { signUpTestUser } from '../../../__tests__/helpers/auth';
import { resetDb } from '../../../__tests__/helpers/db';

// Buffer is faked: calls are recorded and a test can set the next createPost
// answer. No test reaches the real Buffer, so nothing is published.

const realFetch = globalThis.fetch;

type Fake = { throws?: boolean; body?: unknown };
let bufferCalls: { query: string; variables: Record<string, unknown>; key: string | null }[] = [];
let createQueue: Fake[] = [];
let bufferPosts: unknown[] = [];
let postStatus = 'sent';
const creates = () => bufferCalls.filter((call) => call.query.includes('createPost'));

function fake(input: string | URL | Request, init?: RequestInit): Promise<Response> {
  const url = new URL(input instanceof Request ? input.url : String(input));
  if (url.host !== 'api.buffer.com') return realFetch(input, init);
  const { query, variables } = JSON.parse(String(init?.body)) as {
    query: string;
    variables: Record<string, unknown>;
  };
  bufferCalls.push({ query, variables, key: new Headers(init?.headers).get('authorization') });
  const data = (value: unknown) => Promise.resolve(Response.json({ data: value }));
  if (query.includes('createPost')) {
    const next = createQueue.shift();
    if (next?.throws) return Promise.reject(new Error('timeout'));
    if (next?.body) return Promise.resolve(Response.json(next.body));
    return data({ createPost: { post: { id: 'bp_1', status: 'scheduled' } } });
  }
  if (query.includes('organizations')) return data({ account: { organizations: [{ id: 'o1' }] } });
  if (query.includes('channels('))
    return data({
      channels: [
        { id: 'ch_li', service: 'linkedin', name: 'vexol', displayName: 'Vexol EU' },
        { id: 'ch_off', service: 'linkedin', name: 'old', isDisconnected: true },
        { id: 'ch_x', service: 'twitter', name: 'vexoleu' },
      ],
    });
  if (query.includes('channel(')) return data({ channel: { organizationId: 'o1' } });
  if (query.includes('posts('))
    return data({ posts: { edges: bufferPosts.map((node) => ({ node })) } });
  return data({
    post: {
      id: 'bp_1',
      status: postStatus,
      externalLink: 'https://www.linkedin.com/feed/update/urn:li:share:1',
    },
  });
}

const linkedin = (api: Api) => api.projects({ projectKey: 'MKT' }).linkedin;
const key = () => crypto.randomUUID();
const inOneHour = () => new Date(Date.now() + 60 * 60_000).toISOString();

async function setup(options: { buffer?: boolean } = {}) {
  const owner = await signUpTestUser({ name: 'Owner' });
  const asOwner = authedApi(owner.cookie);
  await asOwner.projects.post({ key: 'MKT', name: 'Marketing' });
  if (options.buffer !== false) {
    await asOwner.projects({ projectKey: 'MKT' }).integrations.post({
      integrationKey: 'buffer',
      credential: { apiKey: 'bk-test' },
    });
  }
  return asOwner;
}

async function member(asOwner: Api, permissions: Record<string, Record<string, boolean>>) {
  const role = await asOwner
    .projects({ projectKey: 'MKT' })
    .roles.post({ name: `Role ${key()}`, permissions });
  const person = await signUpTestUser();
  const invite = await asOwner.projects({ projectKey: 'MKT' }).invites.post({
    email: person.email,
    role: 'member',
    roleId: role.data!.id,
  });
  const asPerson = authedApi(person.cookie);
  await asPerson.invites({ token: invite.data!.token }).accept.post();
  return asPerson;
}

async function agentKey(asOwner: Api, permissions: Record<string, Record<string, boolean>>) {
  const role = await asOwner
    .projects({ projectKey: 'MKT' })
    .roles.post({ name: 'LinkedIn agent', permissions });
  const created = await asOwner.projects({ projectKey: 'MKT' })['ai-agents'].post({
    name: 'LinkedIn',
    username: 'linkedin',
    kind: 'external',
    roleId: role.data!.id,
  });
  return created.data!.apiKey!;
}

async function rpc(apiKey: string, method: string, params?: unknown) {
  const response = await app.handle(
    new Request('http://localhost/mcp/linkedin-agent', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    }),
  );
  const text = await response.text();
  const data = text.split('\n').find((line) => line.startsWith('data: '));
  return JSON.parse(data ? data.slice('data: '.length) : text).result;
}

describe('LinkedIn', () => {
  beforeEach(async () => {
    await resetDb();
    bufferCalls = [];
    createQueue = [];
    bufferPosts = [];
    postStatus = 'sent';
    globalThis.fetch = fake as typeof fetch;
  }, 30_000);

  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  it('lists only the LinkedIn channels of the Buffer account', async () => {
    const asOwner = await setup();
    const channels = await linkedin(asOwner).channels.get();
    expect(channels.data).toMatchObject({ configured: true, error: null });
    expect(channels.data!.channels.map((c) => [c.id, c.connected])).toEqual([
      ['ch_li', true],
      ['ch_off', false],
    ]);
    expect(bufferCalls[0]!.key).toBe('Bearer bk-test');
  });

  it('reports a missing Buffer key', async () => {
    const asOwner = await setup({ buffer: false });
    const channels = await linkedin(asOwner).channels.get();
    expect(channels.data).toMatchObject({ configured: false, channels: [] });
    expect(channels.data!.error).toContain('Buffer API key');
    const created = await linkedin(asOwner).posts.post({
      text: 'Hello',
      channelId: 'ch_li',
      mode: 'now',
      idempotencyKey: key(),
    });
    expect(created.status).toBe(503);
  });

  it('schedules a post with images through Buffer and lists it', async () => {
    const asOwner = await setup();
    const scheduledFor = inOneHour();
    const created = await linkedin(asOwner).posts.post({
      text: '  We are hiring.  ',
      imageUrls: ['https://cdn.example.com/a.png'],
      channelId: 'ch_li',
      mode: 'schedule',
      scheduledFor,
      idempotencyKey: key(),
    });
    expect(created.status).toBe(201);
    expect(created.data).toMatchObject({
      text: 'We are hiring.',
      status: 'scheduled',
      bufferPostId: 'bp_1',
      channelName: 'Vexol EU',
      createdByName: 'Owner',
    });
    expect(creates()[0]!.variables.input).toEqual({
      text: 'We are hiring.',
      channelId: 'ch_li',
      schedulingType: 'automatic',
      mode: 'customScheduled',
      dueAt: scheduledFor,
      assets: [{ image: { url: 'https://cdn.example.com/a.png' } }],
    });
    const posts = await linkedin(asOwner).posts.get();
    expect(posts.data!.map((p) => p.id)).toEqual([created.data!.id]);
  });

  it('publishes now and sends a repeated request only once', async () => {
    const asOwner = await setup();
    const body = { text: 'Now', channelId: 'ch_li', mode: 'now' as const, idempotencyKey: key() };
    const first = await linkedin(asOwner).posts.post(body);
    const again = await linkedin(asOwner).posts.post(body);
    expect(again.data!.id).toBe(first.data!.id);
    expect(creates()).toHaveLength(1);
    expect(creates()[0]!.variables.input).toMatchObject({ mode: 'shareNow' });
  });

  it('refuses a wrong channel, a past time and a too long text', async () => {
    const asOwner = await setup();
    const base = { text: 'Hi', mode: 'now' as const, idempotencyKey: key() };
    for (const channelId of ['ch_x', 'ch_off']) {
      const response = await linkedin(asOwner).posts.post({ ...base, channelId });
      expect(response.status).toBe(400);
    }
    const past = await linkedin(asOwner).posts.post({
      ...base,
      channelId: 'ch_li',
      mode: 'schedule',
      scheduledFor: new Date(Date.now() - 60_000).toISOString(),
    });
    expect(past.status).toBe(400);
    const long = await linkedin(asOwner).posts.post({
      ...base,
      channelId: 'ch_li',
      text: 'a'.repeat(3001),
    });
    expect(long.status).toBe(400);
    const max = await linkedin(asOwner).posts.post({
      ...base,
      channelId: 'ch_li',
      text: 'a'.repeat(3000),
    });
    expect(max.status).toBe(201);
    const httpImage = await linkedin(asOwner).posts.post({
      ...base,
      channelId: 'ch_li',
      imageUrls: ['http://example.com/a.png'],
      idempotencyKey: key(),
    });
    expect(httpImage.status).toBe(400);
    expect(creates()).toHaveLength(1);
  });

  it("shows Buffer's refusal as a failed post", async () => {
    const asOwner = await setup();
    createQueue = [{ body: { data: { createPost: { message: 'Duplicate content' } } } }];
    const created = await linkedin(asOwner).posts.post({
      text: 'Dup',
      channelId: 'ch_li',
      mode: 'now',
      idempotencyKey: key(),
    });
    expect(created.data).toMatchObject({
      status: 'failed',
      lastError: 'Buffer refused: Duplicate content',
    });
  });

  it('finds an unanswered post in Buffer on refresh', async () => {
    const asOwner = await setup();
    createQueue = [{ throws: true }];
    const created = await linkedin(asOwner).posts.post({
      text: 'Lost',
      channelId: 'ch_li',
      mode: 'now',
      idempotencyKey: key(),
    });
    expect(created.data!.status).toBe('unknown');
    bufferPosts = [{ id: 'bp_9', text: 'Lost', status: 'sent' }];
    const refreshed = await linkedin(asOwner).posts({ postId: created.data!.id }).refresh.post();
    expect(refreshed.data).toMatchObject({ status: 'published', bufferPostId: 'bp_9' });
  });

  it('marks an unanswered post failed when Buffer has no record of it', async () => {
    const asOwner = await setup();
    createQueue = [{ throws: true }];
    const created = await linkedin(asOwner).posts.post({
      text: 'Gone',
      channelId: 'ch_li',
      mode: 'now',
      idempotencyKey: key(),
    });
    const refreshed = await linkedin(asOwner).posts({ postId: created.data!.id }).refresh.post();
    expect(refreshed.data).toMatchObject({ status: 'failed' });
    expect(refreshed.data!.lastError).toContain('no record');
  });

  it('refreshes a scheduled post to published', async () => {
    const asOwner = await setup();
    const created = await linkedin(asOwner).posts.post({
      text: 'Later',
      channelId: 'ch_li',
      mode: 'schedule',
      scheduledFor: inOneHour(),
      idempotencyKey: key(),
    });
    const refreshed = await linkedin(asOwner).posts({ postId: created.data!.id }).refresh.post();
    expect(refreshed.data).toMatchObject({
      status: 'published',
      platformPostUrl: 'https://www.linkedin.com/feed/update/urn:li:share:1',
    });
    const missing = await linkedin(asOwner).posts({ postId: key() }).refresh.post();
    expect(missing.status).toBe(404);
  });

  it('lets a reader see posts but not publish, and keeps out a member without access', async () => {
    const asOwner = await setup();
    const reader = await member(asOwner, { linkedin: { read: true } });
    expect((await linkedin(reader).posts.get()).status).toBe(200);
    const byReader = await linkedin(reader).posts.post({
      text: 'Hi',
      channelId: 'ch_li',
      mode: 'now',
      idempotencyKey: key(),
    });
    expect(byReader.status).toBe(403);
    const outsider = await member(asOwner, { twitter: { read: true } });
    expect((await linkedin(outsider).posts.get()).status).toBe(403);
    expect(creates()).toHaveLength(0);
  });

  describe('MCP endpoint', () => {
    it('serves only the LinkedIn tools, apart from /mcp', async () => {
      const asOwner = await setup();
      await asOwner.projects({ projectKey: 'MKT' }).settings.patch({ mcpEnabled: true });
      const apiKey = await agentKey(asOwner, { linkedin: { read: true, create: true } });
      const tools = (await rpc(apiKey, 'tools/list')).tools as { name: string }[];
      expect(tools.map((tool) => tool.name).sort()).toEqual([
        'create_linkedin_post',
        'list_linkedin_channels',
        'list_linkedin_posts',
        'refresh_linkedin_post',
      ]);
    });

    it('lets the agent schedule a post that shows on the page', async () => {
      const asOwner = await setup();
      await asOwner.projects({ projectKey: 'MKT' }).settings.patch({ mcpEnabled: true });
      const apiKey = await agentKey(asOwner, { linkedin: { read: true, create: true } });
      const result = await rpc(apiKey, 'tools/call', {
        name: 'create_linkedin_post',
        arguments: {
          projectKey: 'MKT',
          text: 'From the agent',
          channelId: 'ch_li',
          mode: 'schedule',
          scheduledFor: inOneHour(),
          idempotencyKey: key(),
        },
      });
      expect(result.isError).toBe(false);
      expect(JSON.parse(result.content[0].text)).toMatchObject({ status: 'scheduled' });
      const posts = await linkedin(asOwner).posts.get();
      expect(posts.data![0]).toMatchObject({ text: 'From the agent', createdByName: 'LinkedIn' });
    });

    it('refuses an agent whose role cannot post', async () => {
      const asOwner = await setup();
      await asOwner.projects({ projectKey: 'MKT' }).settings.patch({ mcpEnabled: true });
      const apiKey = await agentKey(asOwner, { linkedin: { read: true } });
      const result = await rpc(apiKey, 'tools/call', {
        name: 'create_linkedin_post',
        arguments: {
          projectKey: 'MKT',
          text: 'No',
          channelId: 'ch_li',
          mode: 'now',
          idempotencyKey: key(),
        },
      });
      expect(result.isError).toBe(true);
      expect(creates()).toHaveLength(0);
    });
  });
});
