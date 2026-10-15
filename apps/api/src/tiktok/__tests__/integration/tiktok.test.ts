import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { app } from '../../../app';
import { authedApi, type Api } from '../../../__tests__/helpers/app';
import { signUpTestUser } from '../../../__tests__/helpers/auth';
import { resetDb } from '../../../__tests__/helpers/db';

// Buffer is faked: calls are recorded and a test can set the next createPost
// answer. No test reaches the real Buffer, so nothing is posted.

const realFetch = globalThis.fetch;

let bufferCalls: { query: string; variables: Record<string, unknown> }[] = [];
let createQueue: { throws?: boolean; body?: unknown }[] = [];
let bufferPosts: unknown[] = [];
const creates = () => bufferCalls.filter((call) => call.query.includes('createPost'));

function fake(input: string | URL | Request, init?: RequestInit): Promise<Response> {
  const url = new URL(input instanceof Request ? input.url : String(input));
  if (url.host !== 'api.buffer.com') return realFetch(input, init);
  const { query, variables } = JSON.parse(String(init?.body)) as {
    query: string;
    variables: Record<string, unknown>;
  };
  bufferCalls.push({ query, variables });
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
        { id: 'ch_tt', service: 'tiktok', name: 'vexol', displayName: 'Vexol TikTok' },
        { id: 'ch_li', service: 'linkedin', name: 'vexol' },
      ],
    });
  if (query.includes('channel(')) return data({ channel: { organizationId: 'o1' } });
  if (query.includes('posts('))
    return data({ posts: { edges: bufferPosts.map((node) => ({ node })) } });
  return data({ post: { id: 'bp_1', status: 'sent' } });
}

const tiktok = (api: Api) => api.projects({ projectKey: 'MKT' }).tiktok;
const key = () => crypto.randomUUID();
const VIDEO = 'https://cdn.example.com/video.mp4';
const animation = {
  prompt: 'A rocket launches over a city at night',
  colors: ['#0f172a', '#f97316'],
  style: 'flat 2D',
  durationSeconds: 12,
};

async function setup() {
  const owner = await signUpTestUser({ name: 'Owner' });
  const asOwner = authedApi(owner.cookie);
  await asOwner.projects.post({ key: 'MKT', name: 'Marketing' });
  await asOwner.projects({ projectKey: 'MKT' }).integrations.post({
    integrationKey: 'buffer',
    credential: { apiKey: 'bk-test' },
  });
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
  await asOwner.projects({ projectKey: 'MKT' }).settings.patch({ mcpEnabled: true });
  const role = await asOwner
    .projects({ projectKey: 'MKT' })
    .roles.post({ name: 'TikTok agent', permissions });
  const created = await asOwner.projects({ projectKey: 'MKT' })['ai-agents'].post({
    name: 'TikTok',
    username: 'tiktok',
    kind: 'external',
    roleId: role.data!.id,
  });
  return created.data!.apiKey!;
}

async function rpc(apiKey: string, method: string, params?: unknown) {
  const response = await app.handle(
    new Request('http://localhost/mcp/tiktok-agent', {
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

async function videoDraft(asOwner: Api) {
  const draft = await tiktok(asOwner).drafts.post({
    title: 'Launch',
    ...animation,
    caption: 'We launched #vexol',
    videoUrl: VIDEO,
  });
  return draft.data!;
}

describe('TikTok', () => {
  beforeEach(async () => {
    await resetDb();
    bufferCalls = [];
    createQueue = [];
    bufferPosts = [];
    globalThis.fetch = fake as typeof fetch;
  }, 30_000);

  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  describe('library', () => {
    it('adds, changes, lists and deletes a template', async () => {
      const asOwner = await setup();
      const created = await tiktok(asOwner).templates.post({ name: 'Rocket', ...animation });
      expect(created.status).toBe(201);
      expect(created.data).toMatchObject({ name: 'Rocket', ...animation });

      const id = created.data!.id;
      const changed = await tiktok(asOwner)
        .templates({ templateId: id })
        .patch({
          colors: ['#ffffff'],
        });
      expect(changed.data).toMatchObject({ colors: ['#ffffff'], prompt: animation.prompt });
      expect((await tiktok(asOwner).templates.get()).data!.map((t) => t.id)).toEqual([id]);

      expect((await tiktok(asOwner).templates({ templateId: id }).delete()).status).toBe(204);
      expect((await tiktok(asOwner).templates({ templateId: id }).delete()).status).toBe(404);
      expect((await tiktok(asOwner).templates.get()).data).toEqual([]);
    });

    it('refuses a color that is not hex, an empty prompt and an unknown template', async () => {
      const asOwner = await setup();
      const badColor = await tiktok(asOwner).templates.post({
        name: 'X',
        ...animation,
        colors: ['orange'],
      });
      expect(badColor.status).toBe(400);
      const empty = await tiktok(asOwner).templates.post({ name: 'X', ...animation, prompt: '' });
      expect(empty.status).toBe(400);
      const missing = await tiktok(asOwner).templates({ templateId: key() }).patch({ name: 'Y' });
      expect(missing.status).toBe(404);
    });
  });

  describe('drafts', () => {
    it('fills a draft from a template and keeps the given fields', async () => {
      const asOwner = await setup();
      const template = await tiktok(asOwner).templates.post({ name: 'Rocket', ...animation });
      const draft = await tiktok(asOwner).drafts.post({
        title: 'Launch day',
        templateId: template.data!.id,
        style: 'neon',
      });
      expect(draft.status).toBe(201);
      expect(draft.data).toMatchObject({
        templateId: template.data!.id,
        prompt: animation.prompt,
        colors: animation.colors,
        style: 'neon',
        durationSeconds: 12,
        videoUrl: null,
        createdByName: 'Owner',
      });
    });

    it('needs a prompt or a template', async () => {
      const asOwner = await setup();
      const draft = await tiktok(asOwner).drafts.post({ title: 'Nothing' });
      expect(draft.status).toBe(400);
    });

    it('sets the video and refuses a non-https one', async () => {
      const asOwner = await setup();
      const draft = await tiktok(asOwner).drafts.post({ title: 'Launch', ...animation });
      const id = draft.data!.id;
      const updated = await tiktok(asOwner).drafts({ draftId: id }).patch({ videoUrl: VIDEO });
      expect(updated.data!.videoUrl).toBe(VIDEO);
      const http = await tiktok(asOwner)
        .drafts({ draftId: id })
        .patch({ videoUrl: 'http://cdn.example.com/v.mp4' });
      expect(http.status).toBe(400);
      expect((await tiktok(asOwner).drafts({ draftId: id }).get()).data!.videoUrl).toBe(VIDEO);
      expect((await tiktok(asOwner).drafts({ draftId: id }).delete()).status).toBe(204);
      expect((await tiktok(asOwner).drafts({ draftId: id }).get()).status).toBe(404);
    });
  });

  describe('publishing through Buffer', () => {
    it('lists only the TikTok channels', async () => {
      const asOwner = await setup();
      const channels = await tiktok(asOwner).channels.get();
      expect(channels.data!.channels.map((c) => c.id)).toEqual(['ch_tt']);
    });

    it('schedules the video and caption, and sends a repeated request once', async () => {
      const asOwner = await setup();
      const draft = await videoDraft(asOwner);
      const scheduledFor = new Date(Date.now() + 60 * 60_000).toISOString();
      const body = {
        channelId: 'ch_tt',
        mode: 'schedule' as const,
        scheduledFor,
        idempotencyKey: key(),
      };
      const first = await tiktok(asOwner).drafts({ draftId: draft.id }).publish.post(body);
      expect(first.status).toBe(201);
      expect(first.data).toMatchObject({
        status: 'scheduled',
        draftId: draft.id,
        videoUrl: VIDEO,
        channelName: 'Vexol TikTok',
      });
      expect(creates()[0]!.variables.input).toEqual({
        text: 'We launched #vexol',
        channelId: 'ch_tt',
        schedulingType: 'automatic',
        mode: 'customScheduled',
        dueAt: scheduledFor,
        assets: [{ video: { url: VIDEO } }],
      });
      const again = await tiktok(asOwner).drafts({ draftId: draft.id }).publish.post(body);
      expect(again.data!.id).toBe(first.data!.id);
      expect(creates()).toHaveLength(1);
      expect((await tiktok(asOwner).posts.get()).data!.map((p) => p.id)).toEqual([first.data!.id]);
    });

    it('refuses a draft without video and a channel that is not TikTok', async () => {
      const asOwner = await setup();
      const noVideo = await tiktok(asOwner).drafts.post({ title: 'Empty', ...animation });
      const body = { channelId: 'ch_tt', mode: 'now' as const, idempotencyKey: key() };
      const refused = await tiktok(asOwner)
        .drafts({ draftId: noVideo.data!.id })
        .publish.post(body);
      expect(refused.status).toBe(400);
      const draft = await videoDraft(asOwner);
      const linkedin = await tiktok(asOwner)
        .drafts({ draftId: draft.id })
        .publish.post({ ...body, channelId: 'ch_li' });
      expect(linkedin.status).toBe(400);
      expect(creates()).toHaveLength(0);
    });

    it('finds an unanswered post in Buffer on refresh', async () => {
      const asOwner = await setup();
      const draft = await videoDraft(asOwner);
      createQueue = [{ throws: true }];
      const sent = await tiktok(asOwner)
        .drafts({ draftId: draft.id })
        .publish.post({ channelId: 'ch_tt', mode: 'now', idempotencyKey: key() });
      expect(sent.data!.status).toBe('unknown');
      bufferPosts = [{ id: 'bp_7', text: 'We launched #vexol', status: 'sent' }];
      const refreshed = await tiktok(asOwner).posts({ postId: sent.data!.id }).refresh.post();
      expect(refreshed.data).toMatchObject({ status: 'published', bufferPostId: 'bp_7' });
    });
  });

  describe('access', () => {
    it('lets a reader see the library but not change or post', async () => {
      const asOwner = await setup();
      const draft = await videoDraft(asOwner);
      const reader = await member(asOwner, { tiktok: { read: true } });
      expect((await tiktok(reader).drafts.get()).status).toBe(200);
      expect((await tiktok(reader).templates.post({ name: 'X', ...animation })).status).toBe(403);
      const post = await tiktok(reader)
        .drafts({ draftId: draft.id })
        .publish.post({ channelId: 'ch_tt', mode: 'now', idempotencyKey: key() });
      expect(post.status).toBe(403);
      const outsider = await member(asOwner, { linkedin: { read: true } });
      expect((await tiktok(outsider).drafts.get()).status).toBe(403);
    });
  });

  describe('MCP endpoint', () => {
    it('serves only the TikTok tools', async () => {
      const asOwner = await setup();
      const apiKey = await agentKey(asOwner, { tiktok: { read: true, create: true, edit: true } });
      const tools = (await rpc(apiKey, 'tools/list')).tools as { name: string }[];
      expect(tools.map((tool) => tool.name).sort()).toEqual([
        'create_tiktok_draft',
        'create_tiktok_template',
        'get_tiktok_draft',
        'list_tiktok_channels',
        'list_tiktok_drafts',
        'list_tiktok_posts',
        'list_tiktok_templates',
        'publish_tiktok_draft',
        'refresh_tiktok_post',
        'update_tiktok_draft',
      ]);
    });

    it('lets the agent make a draft, attach the video and post it', async () => {
      const asOwner = await setup();
      const apiKey = await agentKey(asOwner, { tiktok: { read: true, create: true, edit: true } });
      const call = async (name: string, args: Record<string, unknown>) => {
        const result = await rpc(apiKey, 'tools/call', {
          name,
          arguments: { projectKey: 'MKT', ...args },
        });
        expect(result.isError).toBe(false);
        return JSON.parse(result.content[0].text);
      };
      const draft = await call('create_tiktok_draft', { title: 'Agent video', ...animation });
      await call('update_tiktok_draft', { draftId: draft.id, videoUrl: VIDEO, caption: 'Hi' });
      const post = await call('publish_tiktok_draft', {
        draftId: draft.id,
        channelId: 'ch_tt',
        mode: 'now',
        idempotencyKey: key(),
      });
      expect(post).toMatchObject({ status: 'scheduled', createdByName: 'TikTok' });
      expect(creates()[0]!.variables.input).toMatchObject({ text: 'Hi', mode: 'shareNow' });
    });
  });
});
