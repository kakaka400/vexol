import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { app } from '../../../app';
import { api as anonymous, apiKeyApi, authedApi, type Api } from '../../../__tests__/helpers/app';
import { signUpTestUser } from '../../../__tests__/helpers/auth';
import { resetDb } from '../../../__tests__/helpers/db';

// X, oEmbed and Buffer are the only things reached over the network. Each is
// faked here: calls are recorded, and a test can make the next one fail. No test
// reaches the real services, so no post is ever published.

const WORKER_TOKEN = 'worker-token-for-twitter-tests';
const realFetch = globalThis.fetch;

type Fake = { status?: number; throws?: boolean; body?: unknown };
let xCalls: { path: string; query: URLSearchParams; authorization: string | null }[] = [];
let xNext: Record<string, Fake> = {};
let oembedCalls = 0;
let bufferCalls: { query: string; variables: Record<string, unknown>; key: string | null }[] = [];
let bufferCreateQueue: Fake[] = [];
let bufferChannels: unknown[] = [];
let bufferPosts: unknown[] = [];
let bufferStatus = 'sent';
const creates = () => bufferCalls.filter((call) => call.query.includes('createPost'));

const tweets = (ids: string[], handle = 'VexolEU') => ({
  data: ids.map((id) => ({
    id,
    text: `Post ${id}: AI agents cut support time by 40% #ai`,
    created_at: new Date(Date.now() - 2 * 60 * 60_000).toISOString(),
    lang: 'en',
    author_id: 'u1',
    public_metrics: { like_count: 10, retweet_count: 2, reply_count: 1, quote_count: 0 },
  })),
  includes: { users: [{ id: 'u1', username: handle, name: 'Vexol' }] },
});

function fake(input: string | URL | Request, init?: RequestInit): Promise<Response> {
  const url = new URL(input instanceof Request ? input.url : String(input));
  const headers = new Headers(init?.headers);
  if (url.host === 'api.x.com') {
    const route = url.pathname.replace(/^\/2/, '');
    xCalls.push({
      path: route,
      query: url.searchParams,
      authorization: headers.get('authorization'),
    });
    const key = Object.keys(xNext).find((prefix) => route.startsWith(prefix));
    const next = key ? xNext[key]! : null;
    if (next?.throws) return Promise.reject(new Error('timeout'));
    if (next?.status)
      return Promise.resolve(Response.json({ title: 'Error' }, { status: next.status }));
    if (next?.body) return Promise.resolve(Response.json(next.body));
    if (route.startsWith('/tweets/search/recent'))
      return Promise.resolve(Response.json(tweets(['101', '102'])));
    if (route.startsWith('/users/by/username/')) {
      return Promise.resolve(
        Response.json({
          data: {
            id: 'u1',
            username: 'VexolEU',
            name: 'Vexol',
            description: 'Bio',
            public_metrics: { followers_count: 50 },
          },
        }),
      );
    }
    if (route.startsWith('/users/u1/tweets'))
      return Promise.resolve(Response.json(tweets(['201'])));
    if (route.startsWith('/tweets/'))
      return Promise.resolve(
        Response.json({
          ...tweets([route.split('/')[2]!]),
          data: tweets([route.split('/')[2]!]).data[0],
        }),
      );
    return Promise.resolve(Response.json({}, { status: 404 }));
  }
  if (url.host === 'publish.twitter.com') {
    oembedCalls += 1;
    const target = url.searchParams.get('url') ?? '';
    if (target.endsWith('/404')) return Promise.resolve(new Response('', { status: 404 }));
    return Promise.resolve(
      Response.json({
        author_name: 'Someone',
        author_url: 'https://twitter.com/someone',
        html: '<blockquote><p lang="en" dir="ltr">Public post text</p>&mdash; Someone (@someone) <a href="https://twitter.com/someone/status/1?ref_src=x">October 1, 2026</a></blockquote>',
      }),
    );
  }
  if (url.host === 'api.buffer.com') {
    const { query, variables } = JSON.parse(String(init?.body)) as {
      query: string;
      variables: Record<string, unknown>;
    };
    bufferCalls.push({ query, variables, key: headers.get('authorization') });
    const data = (value: unknown) => Promise.resolve(Response.json({ data: value }));
    if (query.includes('createPost')) {
      const next = bufferCreateQueue.shift();
      if (next?.throws) return Promise.reject(new Error('timeout'));
      if (next?.status || next?.body) {
        return Promise.resolve(Response.json(next.body ?? {}, { status: next.status ?? 200 }));
      }
      return data({ createPost: { post: { id: 'bp_1', status: 'scheduled' } } });
    }
    if (query.includes('organizations'))
      return data({ account: { organizations: [{ id: 'org_1' }] } });
    if (query.includes('channels(')) return data({ channels: bufferChannels });
    if (query.includes('channel(')) return data({ channel: { organizationId: 'org_1' } });
    if (query.includes('posts('))
      return data({ posts: { edges: bufferPosts.map((node) => ({ node })) } });
    return data({
      post: { id: 'bp_1', status: bufferStatus, externalLink: 'https://x.com/vexoleu/status/999' },
    });
  }
  return realFetch(input, init);
}

const twitter = (api: Api) => api.projects({ projectKey: 'MKT' }).twitter;
const key = () => crypto.randomUUID();

async function sweep(notes = 200) {
  const response = await anonymous.internal.twitter.sweep.post(
    { runs: 5, notes },
    { headers: { 'x-worker-token': WORKER_TOKEN } },
  );
  expect(response.status).toBe(200);
  return response.data!;
}

async function setup(options: { xToken?: boolean; buffer?: boolean } = {}) {
  const owner = await signUpTestUser({ name: 'Owner' });
  const asOwner = authedApi(owner.cookie);
  await asOwner.projects.post({ key: 'MKT', name: 'Marketing' });
  if (options.xToken !== false) {
    await asOwner.projects({ projectKey: 'MKT' }).integrations.post({
      integrationKey: 'x_api',
      credential: { bearerToken: 'x-test-token' },
    });
  }
  if (options.buffer !== false) {
    await asOwner.projects({ projectKey: 'MKT' }).integrations.post({
      integrationKey: 'buffer',
      credential: { apiKey: 'bk-test' },
    });
  }
  return { owner, asOwner };
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

async function agent(
  asOwner: Api,
  permissions: Record<string, Record<string, boolean>>,
  username = 'atlas',
) {
  const role = await asOwner
    .projects({ projectKey: 'MKT' })
    .roles.post({ name: `Agent ${username}`, permissions });
  const created = await asOwner.projects({ projectKey: 'MKT' })['ai-agents'].post({
    name: username,
    username,
    kind: 'external',
    roleId: role.data!.id,
  });
  return created.data!.apiKey!;
}

function rpc(endpoint: string, apiKey: string, method: string, params?: unknown) {
  return app.handle(
    new Request(`http://localhost${endpoint}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    }),
  );
}

async function rpcResult(response: Response) {
  const text = await response.text();
  const data = text.split('\n').find((line) => line.startsWith('data: '));
  const json = JSON.parse(data ? data.slice('data: '.length) : text);
  return json.result;
}

describe('Twitter', () => {
  let vault: string;
  const env = {
    vault: process.env.OBSIDIAN_VAULT_DIR,
    worker: process.env.WORKER_INTERNAL_TOKEN,
    retry: process.env.TWITTER_NOTE_RETRY_BASE_MS,
  };

  beforeEach(async () => {
    await resetDb();
    vault = await mkdtemp(path.join(tmpdir(), 'twitter-vault-'));
    process.env.OBSIDIAN_VAULT_DIR = vault;
    process.env.WORKER_INTERNAL_TOKEN = WORKER_TOKEN;
    process.env.TWITTER_NOTE_RETRY_BASE_MS = '1';
    xCalls = [];
    xNext = {};
    oembedCalls = 0;
    bufferCalls = [];
    bufferCreateQueue = [];
    bufferPosts = [];
    bufferStatus = 'sent';
    bufferChannels = [
      { id: 'ch_x', service: 'twitter', name: 'vexoleu', displayName: 'Vexol' },
      { id: 'ch_ig', service: 'instagram', name: 'vexol' },
    ];
    globalThis.fetch = fake as typeof fetch;
  }, 30_000);

  afterEach(async () => {
    globalThis.fetch = realFetch;
    for (const [name, value] of [
      ['OBSIDIAN_VAULT_DIR', env.vault],
      ['WORKER_INTERNAL_TOKEN', env.worker],
      ['TWITTER_NOTE_RETRY_BASE_MS', env.retry],
    ] as const) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    await rm(vault, { recursive: true, force: true });
  });

  describe('research', () => {
    it('stores search results and reports them stored only after the notes are written', async () => {
      const { asOwner } = await setup();
      const run = await twitter(asOwner).research.search.post({
        terms: ['ai agents'],
        hashtags: ['#ai'],
        language: 'en',
        maxResults: 10,
        tags: ['Launch'],
        idempotencyKey: key(),
      });
      expect(run.status).toBe(200);
      expect(run.data).toMatchObject({
        kind: 'search',
        status: 'completed',
        foundCount: 2,
        adapters: ['x_api'],
      });
      expect(run.data!.storage).toMatchObject({ complete: false, written: 0 });
      expect(run.data!.items.map((i) => i.canonicalUrl).sort()).toEqual([
        'https://x.com/vexoleu/status/101',
        'https://x.com/vexoleu/status/102',
      ]);
      expect(run.data!.items[0]).toMatchObject({
        tags: ['launch'],
        obsidianStatus: 'pending',
        verificationStatus: 'unverified',
      });
      expect(xCalls[0]!.query.get('query')).toBe('("ai agents" OR #ai) lang:en -is:retweet');
      expect(xCalls[0]!.authorization).toBe('Bearer x-test-token');
      expect(existsSync(path.join(vault, 'Socials/Twitter/Posts/101.md'))).toBe(false);

      await sweep();
      const after = await twitter(asOwner).research.runs({ runId: run.data!.id }).get();
      expect(after.data!.storage).toMatchObject({ complete: true, failed: 0, pending: 0 });
      expect(after.data!.items.every((i) => i.obsidianStatus === 'written')).toBe(true);

      const post = await readFile(path.join(vault, 'Socials/Twitter/Posts/101.md'), 'utf8');
      expect(post).toContain('type: "twitter-research"');
      expect(post).toContain(`research_run_id: "${run.data!.id}"`);
      expect(post).toContain('canonical_url: "https://x.com/vexoleu/status/101"');
      expect(existsSync(path.join(vault, 'Socials/Twitter/Profiles/vexoleu.md'))).toBe(true);
      expect(existsSync(path.join(vault, 'Socials/Twitter/Dashboard.md'))).toBe(true);
      const runsDir = path.join(
        vault,
        'Socials/Twitter/Research Runs',
        new Date(run.data!.createdAt).toISOString().slice(0, 4),
      );
      expect(existsSync(runsDir)).toBe(true);
      expect(after.data!.obsidianPath).toMatch(
        /^Socials\/Twitter\/Research Runs\/\d{4}\/\d{2}\/.+--ai-agents-ai--[0-9a-f]{8}\.md$/,
      );
    });

    it('queues a background run that the worker executes', async () => {
      const { asOwner } = await setup();
      const created = await twitter(asOwner).research.runs.post({
        handles: ['@VexolEU'],
        idempotencyKey: key(),
      });
      expect(created.status).toBe(201);
      expect(created.data).toMatchObject({ status: 'queued', foundCount: 0 });

      const result = await sweep();
      expect(result.runs).toBe(1);
      const run = await twitter(asOwner).research.runs({ runId: created.data!.id }).get();
      expect(run.data).toMatchObject({ status: 'completed', foundCount: 1 });
      expect(run.data!.items[0]!.canonicalUrl).toBe('https://x.com/vexoleu/status/201');
      const activity = await twitter(asOwner).activity.get({
        query: { correlationId: run.data!.correlationId },
      });
      expect(activity.data!.map((a) => a.event)).toEqual(
        expect.arrayContaining([
          'twitter.research.requested',
          'twitter.research.started',
          'twitter.research.completed',
          'obsidian.ingest.completed',
        ]),
      );
    });

    it('creates a run once per idempotency key', async () => {
      const { asOwner } = await setup();
      const idempotencyKey = key();
      const first = await twitter(asOwner).research.runs.post({ terms: ['x'], idempotencyKey });
      const second = await twitter(asOwner).research.runs.post({ terms: ['x'], idempotencyKey });
      expect(second.data!.id).toBe(first.data!.id);
      expect((await twitter(asOwner).research.runs.get()).data).toHaveLength(1);
    });

    it('validates the research input on the server', async () => {
      const { asOwner } = await setup();
      const cases = [
        { body: { idempotencyKey: key() }, error: 'Give a question' },
        {
          body: { handles: ['not a handle!'], idempotencyKey: key() },
          error: 'Not a valid X handle',
        },
        {
          body: { urls: ['https://evil.example/a/status/1'], idempotencyKey: key() },
          error: 'Only x.com',
        },
        { body: { hashtags: ['no spaces'], idempotencyKey: key() }, error: 'Not a valid hashtag' },
        {
          body: { terms: ['a'], since: '2026-10-05', until: '2026-10-01', idempotencyKey: key() },
          error: 'start date',
        },
      ];
      for (const { body, error } of cases) {
        const response = await twitter(asOwner).research.runs.post(body as never);
        expect(response.status).toBe(400);
        expect((response.error!.value as { error: string }).error).toContain(error);
      }
      const tooMany = await twitter(asOwner).research.runs.post({
        terms: ['a'],
        maxResults: 101,
        idempotencyKey: key(),
      });
      expect(tooMany.status).toBe(400);
      const wrongTool = await twitter(asOwner).research.post.post({
        handles: ['vexoleu'],
        idempotencyKey: key(),
      });
      expect(wrongTool.status).toBe(400);
      expect(xCalls).toHaveLength(0);
    });

    it('completes with no results when X finds nothing', async () => {
      const { asOwner } = await setup();
      xNext['/tweets/search/recent'] = { body: { meta: { result_count: 0 } } };
      const run = await twitter(asOwner).research.search.post({
        terms: ['nothing'],
        idempotencyKey: key(),
      });
      expect(run.data).toMatchObject({ status: 'completed', foundCount: 0, items: [] });
    });

    for (const [status, reason] of [
      [401, 'refused the request (401)'],
      [403, 'denied access (403)'],
      [429, 'rate limit reached'],
    ] as const) {
      it(`stops at ${status}, keeps what it had, and does not retry`, async () => {
        const { asOwner } = await setup();
        xNext['/tweets/search/recent'] = { status };
        const run = await twitter(asOwner).research.search.post({
          terms: ['ai'],
          urls: ['https://x.com/vexoleu/status/555'],
          idempotencyKey: key(),
        });
        expect(run.data!.status).toBe('stopped');
        expect(run.data!.stopReason).toContain(reason);
        // The post lookup ran before the search and is kept.
        expect(run.data!.items.map((i) => i.postId)).toEqual(['555']);
        const calls = xCalls.length;
        await sweep();
        expect(xCalls).toHaveLength(calls);
        const again = await twitter(asOwner).research.runs({ runId: run.data!.id }).get();
        expect(again.data!.status).toBe('stopped');
        const activity = await twitter(asOwner).activity.get({ query: { level: 'error' } });
        expect(activity.data!.map((a) => a.event)).toContain('twitter.research.stopped');
      });
    }

    it('retries a run that only timed out, then gives up', async () => {
      const { asOwner } = await setup();
      xNext['/tweets/search/recent'] = { throws: true };
      const created = await twitter(asOwner).research.runs.post({
        terms: ['ai'],
        idempotencyKey: key(),
      });
      await sweep();
      const waiting = await twitter(asOwner).research.runs({ runId: created.data!.id }).get();
      expect(waiting.data).toMatchObject({
        status: 'queued',
        retryCount: 1,
        step: 'waiting to retry',
      });
      expect(waiting.data!.warnings[0]).toContain('no answer');
      const activity = await twitter(asOwner).activity.get({
        query: { event: 'twitter.research.retry' },
      });
      expect(activity.data).toHaveLength(1);
    });

    it('reports partial results when one part of a run fails', async () => {
      const { asOwner } = await setup();
      xNext['/tweets/search/recent'] = { status: 503 };
      const run = await twitter(asOwner).research.search.post({
        terms: ['ai'],
        urls: ['https://twitter.com/VexolEU/status/777'],
        idempotencyKey: key(),
      });
      expect(run.data).toMatchObject({ status: 'partial', foundCount: 1 });
      expect(run.data!.warnings).toContain('X API returned 503');
    });

    it('deduplicates posts across runs and writes one note per post', async () => {
      const { asOwner } = await setup();
      const first = await twitter(asOwner).research.search.post({
        terms: ['ai'],
        idempotencyKey: key(),
      });
      const second = await twitter(asOwner).research.search.post({
        terms: ['ai'],
        tags: ['again'],
        idempotencyKey: key(),
      });
      expect(second.data!.foundCount).toBe(2);
      await sweep();
      await sweep();

      const library = await twitter(asOwner).items.get({ query: {} });
      expect(library.data).toHaveLength(2);
      for (const entry of library.data!) {
        expect(entry.runIds.sort()).toEqual([first.data!.id, second.data!.id].sort());
        expect(entry.tags).toEqual(['again']);
      }
      expect((await readdir(path.join(vault, 'Socials/Twitter/Posts'))).sort()).toEqual([
        '101.md',
        '102.md',
      ]);
      const completed = await twitter(asOwner).activity.get({
        query: { event: 'twitter.research.completed' },
      });
      expect(completed.data![0]!.summary).toContain('0 new, 2 already in the library');
    });

    it('reads a post URL through oEmbed without an X API token', async () => {
      const { asOwner } = await setup({ xToken: false });
      const run = await twitter(asOwner).research.post.post({
        urls: ['https://twitter.com/Someone/status/42?s=20', 'https://x.com/someone/status/404'],
        idempotencyKey: key(),
      });
      expect(run.data).toMatchObject({ status: 'completed', adapters: ['oembed'], foundCount: 1 });
      expect(run.data!.items[0]).toMatchObject({
        canonicalUrl: 'https://x.com/someone/status/42',
        text: 'Public post text',
        metrics: null,
        adapter: 'oembed',
        sourceStatus: 'partial',
      });
      expect(run.data!.warnings).toContain('Post 404 is not available publicly.');
      expect(oembedCalls).toBe(2);
      expect(xCalls).toHaveLength(0);
    });

    it('fails a search without an X API token instead of scraping', async () => {
      const { asOwner } = await setup({ xToken: false });
      const run = await twitter(asOwner).research.search.post({
        terms: ['ai'],
        idempotencyKey: key(),
      });
      expect(run.data!.status).toBe('failed');
      expect(run.data!.lastError).toContain('needs an X API bearer token');
      expect(xCalls).toHaveLength(0);
      expect(oembedCalls).toBe(0);
    });

    it('takes posts an agent collected and deduplicates them with the library', async () => {
      const { asOwner } = await setup();
      await twitter(asOwner).research.search.post({ terms: ['ai'], idempotencyKey: key() });
      const ingested = await twitter(asOwner).research.ingest.post({
        idempotencyKey: key(),
        question: 'What do founders say about agents?',
        items: [
          {
            url: 'https://x.com/VexolEU/status/101',
            text: 'Post 101: AI agents cut support time by 40% #ai',
          },
          {
            url: 'https://x.com/founder/status/9',
            text: 'Agents are overhyped',
            relevance: 'A sceptical voice',
            links: ['javascript:alert(1)', 'https://example.com/a'],
            media: [{ type: 'photo', url: 'javascript:alert(2)' }],
          },
        ],
      });
      expect(ingested.status).toBe(201);
      expect(ingested.data).toMatchObject({
        kind: 'ingest',
        status: 'completed',
        foundCount: 2,
        adapters: ['agent'],
      });
      const library = await twitter(asOwner).items.get({ query: {} });
      expect(library.data).toHaveLength(3);
      expect(library.data!.find((i) => i.authorHandle === 'founder')).toMatchObject({
        adapter: 'agent',
        verificationStatus: 'unverified',
        relevance: 'A sceptical voice',
        links: ['https://example.com/a'],
        media: [{ type: 'photo', url: null }],
      });

      const invalid = await twitter(asOwner).research.ingest.post({
        idempotencyKey: key(),
        items: [{ url: 'https://x.com/founder', text: 'A profile is not a post' }],
      });
      expect(invalid.status).toBe(400);
    });
  });

  describe('Obsidian ingest', () => {
    it('retries a write that failed for a moment', async () => {
      const { asOwner } = await setup();
      // A directory where the note should go makes the rename fail.
      await mkdir(path.join(vault, 'Socials/Twitter/Posts/101.md'), { recursive: true });
      await twitter(asOwner).research.search.post({ terms: ['ai'], idempotencyKey: key() });
      await sweep();
      const retries = await twitter(asOwner).activity.get({
        query: { event: 'obsidian.ingest.retry' },
      });
      expect(retries.data!.length).toBeGreaterThan(0);
      const pending = await twitter(asOwner).items.get({ query: { stored: 'no' } });
      expect(pending.data!.map((i) => i.postId)).toEqual(['101']);

      await rm(path.join(vault, 'Socials/Twitter/Posts/101.md'), { recursive: true });
      await sweep();
      expect((await twitter(asOwner).items.get({ query: { stored: 'no' } })).data).toHaveLength(0);
      expect(await readFile(path.join(vault, 'Socials/Twitter/Posts/101.md'), 'utf8')).toContain(
        'post_id: "101"',
      );
    });

    it('shows a permanent failure in Activity and writes again on request', async () => {
      const { asOwner } = await setup();
      const file = path.join(vault, 'not-a-directory');
      await writeFile(file, 'x');
      process.env.OBSIDIAN_VAULT_DIR = file;
      const run = await twitter(asOwner).research.search.post({
        terms: ['ai'],
        idempotencyKey: key(),
      });
      await sweep();
      const failed = await twitter(asOwner).research.runs({ runId: run.data!.id }).get();
      expect(failed.data!.storage).toMatchObject({ complete: false, written: 0 });
      expect(failed.data!.storage.failed).toBeGreaterThan(0);
      const errors = await twitter(asOwner).activity.get({
        query: { event: 'obsidian.ingest.failed' },
      });
      expect(errors.data!.length).toBeGreaterThan(0);
      expect(errors.data![0]!.level).toBe('error');
      expect(errors.data![0]!.summary).not.toContain(vault);

      process.env.OBSIDIAN_VAULT_DIR = vault;
      const retried = await twitter(asOwner).obsidian.retry.post();
      expect(retried.data!.requeued).toBeGreaterThan(0);
      await sweep();
      const stored = await twitter(asOwner).research.runs({ runId: run.data!.id }).get();
      expect(stored.data!.storage.complete).toBe(true);
    });

    it('keeps the run unconfirmed when Obsidian is not configured', async () => {
      const { asOwner } = await setup();
      delete process.env.OBSIDIAN_VAULT_DIR;
      const run = await twitter(asOwner).research.search.post({
        terms: ['ai'],
        idempotencyKey: key(),
      });
      await sweep();
      const after = await twitter(asOwner).research.runs({ runId: run.data!.id }).get();
      expect(after.data!.status).toBe('completed');
      expect(after.data!.storage.complete).toBe(false);
      const status = await twitter(asOwner).status.get();
      expect(status.data!.obsidian).toMatchObject({ configured: false, folder: 'Socials/Twitter' });
    });
  });

  describe('drafts', () => {
    it('creates a thread from research items, keeps versions, and links the source chain', async () => {
      const { asOwner } = await setup();
      const run = await twitter(asOwner).research.search.post({
        terms: ['ai'],
        idempotencyKey: key(),
      });
      const source = run.data!.items[0]!;
      const created = await twitter(asOwner).drafts.post({
        posts: ['AI agents cut support time by 40% 1/2', 'Here is how. 2/2'],
        sourceItemIds: [source.id],
        tone: 'plain',
        idempotencyKey: key(),
      });
      expect(created.status).toBe(201);
      expect(created.data).toMatchObject({
        kind: 'thread',
        status: 'draft',
        currentVersion: 1,
        sources: [{ id: source.id }],
      });

      const byId = twitter(asOwner).drafts({ draftId: created.data!.id });
      const unchanged = await byId.versions.post({
        baseVersion: 1,
        posts: created.data!.posts,
        tone: 'plain',
      });
      expect(unchanged.data!.currentVersion).toBe(1);
      const revised = await byId.versions.post({
        baseVersion: 1,
        posts: ['AI agents cut support time by 75%'],
        tone: 'plain',
      });
      expect(revised.data).toMatchObject({ kind: 'single', currentVersion: 2 });
      expect(revised.data!.versions.map((v) => v.version)).toEqual([1, 2]);
      const stale = await byId.versions.post({ baseVersion: 1, posts: ['x'] });
      expect(stale.status).toBe(409);

      const preview = await byId.preview.get();
      expect(preview.data!.issues).toEqual([]);
      expect(preview.data!.warnings[0]).toContain('75%');

      const library = await twitter(asOwner).items.get({ query: { ids: source.id } });
      expect(library.data![0]!.draftIds).toEqual([created.data!.id]);
      await sweep();
      const sourceNote = await readFile(
        path.join(vault, `Socials/Twitter/Posts/${source.postId}.md`),
        'utf8',
      );
      expect(sourceNote).toContain(`[[Socials/Twitter/Drafts/${created.data!.id}|`);
      const draftNote = await readFile(
        path.join(vault, `Socials/Twitter/Drafts/${created.data!.id}.md`),
        'utf8',
      );
      expect(draftNote).toContain(source.canonicalUrl);
    });

    it('checks character limits and refuses sources from elsewhere', async () => {
      const { asOwner } = await setup();
      const long = await twitter(asOwner).drafts.post({
        posts: ['x'.repeat(281)],
        idempotencyKey: key(),
      });
      expect(long.status).toBe(201);
      const preview = await twitter(asOwner).drafts({ draftId: long.data!.id }).preview.get();
      expect(preview.data!.issues).toEqual(['Post 1 is 281 characters; the limit is 280']);
      expect(preview.data!.posts[0]).toMatchObject({ length: 281, overLimit: true });

      const unknown = await twitter(asOwner).drafts.post({
        posts: ['x'],
        sourceItemIds: [crypto.randomUUID()],
        idempotencyKey: key(),
      });
      expect(unknown.status).toBe(404);
      const empty = await twitter(asOwner).drafts.post({ posts: ['  '], idempotencyKey: key() });
      expect(empty.status).toBe(400);
    });

    it('splits text into a thread without saving it', async () => {
      const { asOwner } = await setup();
      const text = Array.from(
        { length: 20 },
        (_, i) => `Point ${i} is explained in a full sentence here.`,
      ).join(' ');
      const response = await twitter(asOwner).compose.thread.post({ text });
      expect(response.data!.posts.length).toBeGreaterThan(1);
      expect((await twitter(asOwner).drafts.get()).data).toHaveLength(0);
    });
  });

  describe('publishing through Buffer', () => {
    async function draftFor(asOwner: Api, posts = ['First 1/2', 'Second 2/2']) {
      const created = await twitter(asOwner).drafts.post({ posts, idempotencyKey: key() });
      return created.data!;
    }
    const tomorrow = () => new Date(Date.now() + 24 * 60 * 60_000).toISOString();
    const publishBody = (draft: { contentHash: string }) => ({
      version: 1,
      contentHash: draft.contentHash,
      accountId: 'ch_x',
      timezone: 'UTC',
      confirm: true as const,
    });

    it('lists only X channels, and says so when there is none', async () => {
      const { asOwner } = await setup();
      const channels = await twitter(asOwner).channels.get();
      expect(channels.data).toMatchObject({
        configured: true,
        channels: [{ id: 'ch_x', platform: 'twitter', username: 'vexoleu', connected: true }],
      });
      expect(channels.data!.capabilities).toMatchObject({
        thread: true,
        publishNow: true,
        schedule: true,
        video: false,
      });
      expect(bufferCalls[0]!.key).toBe('Bearer bk-test');

      const draft = await draftFor(asOwner);
      const validation = await twitter(asOwner).drafts({ draftId: draft.id }).validate.post({
        accountId: 'ch_ig',
        mode: 'now',
        timezone: 'Europe/Amsterdam',
      });
      expect(validation.data!.ok).toBe(false);
      expect(validation.data!.issues).toContain(
        'The chosen account is not an X channel connected in Buffer',
      );
    });

    it('reports a missing Buffer key as a capability, not a success', async () => {
      const { asOwner } = await setup({ buffer: false });
      const channels = await twitter(asOwner).channels.get();
      expect(channels.data).toMatchObject({ configured: false, channels: [] });
      expect(channels.data!.error).toContain('Buffer API key');
    });

    it('schedules a confirmed thread once', async () => {
      const { asOwner } = await setup();
      const draft = await draftFor(asOwner);
      const byId = twitter(asOwner).drafts({ draftId: draft.id });
      const scheduledFor = tomorrow();
      const validation = await byId.validate.post({
        accountId: 'ch_x',
        mode: 'schedule',
        scheduledFor,
        timezone: 'Europe/Amsterdam',
      });
      expect(validation.data).toMatchObject({ ok: true, account: { id: 'ch_x' } });
      expect(creates()).toHaveLength(0);

      const body = {
        ...publishBody(validation.data!),
        timezone: 'Europe/Amsterdam',
        scheduledFor,
      };
      const scheduled = await byId.schedule.post(body);
      expect(scheduled.status).toBe(200);
      expect(scheduled.data!.status).toBe('scheduled');
      expect(scheduled.data!.publications[0]).toMatchObject({
        status: 'scheduled',
        mode: 'schedule',
        bufferPostId: 'bp_1',
        accountHandle: 'vexoleu',
        confirmedByName: 'Owner',
      });
      expect(creates()).toHaveLength(1);
      expect(creates()[0]!.variables.input).toMatchObject({
        text: 'First 1/2',
        channelId: 'ch_x',
        schedulingType: 'automatic',
        mode: 'customScheduled',
        dueAt: scheduledFor,
        metadata: { twitter: { thread: [{ text: 'First 1/2' }, { text: 'Second 2/2' }] } },
      });

      const repeated = await byId.schedule.post(body);
      expect(repeated.status).toBe(200);
      expect(creates()).toHaveLength(1);

      const locked = await byId.versions.post({ baseVersion: 1, posts: ['changed'] });
      expect(locked.status).toBe(409);
    });

    it('requires an explicit confirmation of the previewed version', async () => {
      const { asOwner } = await setup();
      const draft = await draftFor(asOwner);
      const byId = twitter(asOwner).drafts({ draftId: draft.id });
      const base = { version: 1, accountId: 'ch_x', timezone: 'UTC' };
      const unconfirmed = await byId.publish.post({
        ...base,
        contentHash: draft.contentHash,
      } as never);
      expect(unconfirmed.status).toBe(400);
      const wrongHash = await byId.publish.post({
        ...base,
        contentHash: 'f'.repeat(64),
        confirm: true,
      });
      expect(wrongHash.status).toBe(409);
      const pastTime = await byId.schedule.post({
        ...base,
        contentHash: draft.contentHash,
        confirm: true,
        scheduledFor: new Date(Date.now() - 60_000).toISOString(),
      });
      expect(pastTime.status).toBe(400);
      expect(creates()).toHaveLength(0);
    });

    it('treats a timeout as unknown and finds the post in Buffer on retry', async () => {
      const { asOwner } = await setup();
      const draft = await draftFor(asOwner, ['Only post']);
      const byId = twitter(asOwner).drafts({ draftId: draft.id });
      bufferCreateQueue = [{ throws: true }];
      const first = await byId.publish.post(publishBody(draft));
      expect(first.status).toBe(200);
      expect(first.data!.status).toBe('draft');
      expect(first.data!.publications[0]).toMatchObject({ status: 'unknown' });
      expect(first.data!.publications[0]!.lastError).toContain('unavailable');

      bufferPosts = [
        { id: 'bp_1', text: 'Only post', status: 'sent', externalLink: 'https://x.com/a/status/1' },
      ];
      const retried = await byId.publish.post(publishBody(draft));
      expect(retried.data!.status).toBe('published');
      expect(retried.data!.publications[0]).toMatchObject({ bufferPostId: 'bp_1' });
      expect(creates()).toHaveLength(1);
    });

    it('sends again after a timeout when Buffer has no such post', async () => {
      const { asOwner } = await setup();
      const draft = await draftFor(asOwner, ['Only post']);
      const byId = twitter(asOwner).drafts({ draftId: draft.id });
      bufferCreateQueue = [{ throws: true }];
      await byId.publish.post(publishBody(draft));

      const retried = await byId.publish.post(publishBody(draft));
      expect(retried.data!.publications[0]).toMatchObject({ status: 'scheduled' });
      expect(creates()).toHaveLength(2);
      expect(creates()[1]!.variables.input).toMatchObject({ mode: 'shareNow', text: 'Only post' });
    });

    it("shows Buffer's refusal and retries it as a new request", async () => {
      const { asOwner } = await setup();
      const draft = await draftFor(asOwner, ['Only post']);
      const byId = twitter(asOwner).drafts({ draftId: draft.id });
      bufferCreateQueue = [{ body: { data: { createPost: { message: 'Duplicate content' } } } }];
      const refused = await byId.publish.post(publishBody(draft));
      expect(refused.data!.status).toBe('failed');
      expect(refused.data!.publications[0]!.lastError).toBe('Buffer refused: Duplicate content');
      const errors = await twitter(asOwner).activity.get({
        query: { event: 'twitter.publish.failed' },
      });
      expect(errors.data![0]!.summary).toContain('Duplicate content');

      await byId.publish.post(publishBody(draft));
      expect(creates()).toHaveLength(2);
      expect(bufferCalls.some((call) => call.query.includes('posts('))).toBe(false);
    });

    it('refreshes the status from Buffer and writes the Published note', async () => {
      const { asOwner } = await setup();
      const draft = await draftFor(asOwner, ['Only post']);
      const scheduled = await twitter(asOwner)
        .drafts({ draftId: draft.id })
        .schedule.post({ ...publishBody(draft), scheduledFor: tomorrow() });
      const job = scheduled.data!.publications[0]!;
      const status = await twitter(asOwner)['publish-jobs']({ jobId: job.id }).get();
      expect(status.data).toMatchObject({
        status: 'published',
        platformPostUrl: 'https://x.com/vexoleu/status/999',
      });
      await sweep();
      const note = await readFile(path.join(vault, 'Socials/Twitter/Published/bp_1.md'), 'utf8');
      expect(note).toContain('status: "published"');
      expect(note).toContain('confirmed_by: "Owner"');
      expect(note).not.toContain('bk-test');
    });

    it('does not let an agent or a researcher publish', async () => {
      const { asOwner } = await setup();
      const draft = await draftFor(asOwner, ['Only post']);
      const body = publishBody(draft);

      const agentKey = await agent(asOwner, {
        twitter: { read: true, create: true, edit: true },
        twitter_publish: { read: true, create: true },
      });
      const asAgent = apiKeyApi(agentKey);
      const byAgent = await twitter(asAgent).drafts({ draftId: draft.id }).publish.post(body);
      expect(byAgent.status).toBe(403);

      const researcher = await member(asOwner, { twitter: { read: true, create: true } });
      const byResearcher = await twitter(researcher)
        .drafts({ draftId: draft.id })
        .publish.post(body);
      expect(byResearcher.status).toBe(403);
      const research = await twitter(researcher).research.search.post({
        terms: ['ai'],
        idempotencyKey: key(),
      });
      expect(research.status).toBe(200);
      expect(creates()).toHaveLength(0);
    });
  });

  describe('access', () => {
    it('needs Twitter permissions', async () => {
      const { asOwner } = await setup();
      const reader = await member(asOwner, { twitter: { read: true } });
      expect((await twitter(reader).research.runs.get()).status).toBe(200);
      expect(
        (await twitter(reader).research.runs.post({ terms: ['a'], idempotencyKey: key() })).status,
      ).toBe(403);
      expect(
        (await twitter(reader).items.patch({ ids: [crypto.randomUUID()], addTags: ['x'] })).status,
      ).toBe(403);

      const outsider = authedApi((await signUpTestUser()).cookie);
      expect((await twitter(outsider).research.runs.get()).status).toBe(403);
      const noToken = await anonymous.internal.twitter.sweep.post({ runs: 1, notes: 1 });
      expect(noToken.status).toBe(401);
    });

    it('never returns secret values in the status', async () => {
      const { asOwner } = await setup();
      const status = await twitter(asOwner).status.get();
      expect(status.data).toMatchObject({
        xApi: { configured: true },
        buffer: { configured: true },
      });
      const text = JSON.stringify(status.data);
      for (const secret of ['x-test-token', 'bk-test', vault]) expect(text).not.toContain(secret);
    });
  });

  describe('MCP endpoints', () => {
    it('serves each tool set on its own endpoint, apart from /mcp', async () => {
      const { asOwner } = await setup();
      await asOwner.projects({ projectKey: 'MKT' }).settings.patch({ mcpEnabled: true });
      const apiKey = await agent(asOwner, { twitter: { read: true, create: true } });

      const names = async (endpoint: string) =>
        ((await rpcResult(await rpc(endpoint, apiKey, 'tools/list'))).tools as { name: string }[])
          .map((tool) => tool.name)
          .sort();

      expect(await names('/mcp/twitter-research')).toEqual([
        'fetch_twitter_post',
        'fetch_twitter_profile',
        'get_research_run',
        'ingest_research_results',
        'run_twitter_research',
        'search_twitter',
      ]);
      expect(await names('/mcp/twitter-agent')).toEqual([
        'create_twitter_draft',
        'generate_thread',
        'generate_variations',
        'get_publish_status',
        'list_publish_channels',
        'list_research_items',
        'list_twitter_activity',
        'preview_twitter_post',
        'publish_twitter_post',
        'revise_twitter_draft',
        'schedule_twitter_post',
        'validate_publish_post',
      ]);
      const general = await names('/mcp');
      expect(general).not.toContain('search_twitter');
      expect(general).not.toContain('create_twitter_draft');
    });

    it('runs the research flow through the research agent and records each call', async () => {
      const { asOwner } = await setup();
      await asOwner.projects({ projectKey: 'MKT' }).settings.patch({ mcpEnabled: true });
      const apiKey = await agent(asOwner, { twitter: { read: true, create: true } });
      const result = await rpcResult(
        await rpc('/mcp/twitter-research', apiKey, 'tools/call', {
          name: 'search_twitter',
          arguments: { projectKey: 'MKT', terms: ['ai'], idempotencyKey: key() },
        }),
      );
      expect(result.isError).toBe(false);
      expect(JSON.parse(result.content[0].text)).toMatchObject({
        status: 'completed',
        foundCount: 2,
      });

      const invalid = await rpcResult(
        await rpc('/mcp/twitter-research', apiKey, 'tools/call', {
          name: 'search_twitter',
          arguments: { projectKey: 'MKT', terms: ['ai'], idempotencyKey: 'not-a-uuid' },
        }),
      );
      expect(invalid.isError).toBe(true);

      const calls = await twitter(asOwner).activity.get({ query: { event: 'mcp.call' } });
      expect(calls.data!.map((a) => a.summary)).toEqual(
        expect.arrayContaining([
          expect.stringContaining('search_twitter succeeded'),
          expect.stringContaining('search_twitter returned an error'),
        ]),
      );
    });
  });

  it('runs end to end: research, Obsidian, library, draft, preview, confirmation, Buffer, activity', async () => {
    const { asOwner } = await setup();
    await asOwner.projects({ projectKey: 'MKT' }).settings.patch({ mcpEnabled: true });
    const researchKey = await agent(asOwner, { twitter: { read: true, create: true } }, 'atlas');
    const writerKey = await agent(
      asOwner,
      { twitter: { read: true, create: true, edit: true } },
      'scribe',
    );

    // 1. The research agent searches through its MCP endpoint.
    const research = await rpcResult(
      await rpc('/mcp/twitter-research', researchKey, 'tools/call', {
        name: 'search_twitter',
        arguments: {
          projectKey: 'MKT',
          terms: ['ai agents'],
          tags: ['e2e'],
          idempotencyKey: key(),
        },
      }),
    );
    const run = JSON.parse(research.content[0].text);
    expect(run.items).toHaveLength(2);

    // 2. The worker writes the notes; the run is confirmed stored.
    await sweep();
    const stored = await twitter(asOwner).research.runs({ runId: run.id }).get();
    expect(stored.data!.storage.complete).toBe(true);
    expect(existsSync(path.join(vault, stored.data!.obsidianPath!))).toBe(true);

    // 3. The items are in the library.
    const library = await twitter(asOwner).items.get({ query: { tag: 'e2e', stored: 'yes' } });
    expect(library.data).toHaveLength(2);
    const source = library.data![0]!;

    // 4. The Twitter agent drafts from an item through its endpoint.
    const drafted = await rpcResult(
      await rpc('/mcp/twitter-agent', writerKey, 'tools/call', {
        name: 'create_twitter_draft',
        arguments: {
          projectKey: 'MKT',
          posts: ['AI agents cut support time by 40%.'],
          sourceItemIds: [source.id],
          idempotencyKey: key(),
        },
      }),
    );
    expect(drafted.isError).toBe(false);
    const draft = JSON.parse(drafted.content[0].text);
    expect(draft.createdByAgent).toBe(true);

    // 5. The preview shows the sources and no unsourced numbers.
    const preview = await rpcResult(
      await rpc('/mcp/twitter-agent', writerKey, 'tools/call', {
        name: 'preview_twitter_post',
        arguments: { projectKey: 'MKT', draftId: draft.id },
      }),
    );
    const previewBody = JSON.parse(preview.content[0].text);
    expect(previewBody.sources[0].id).toBe(source.id);
    expect(previewBody.warnings.join(' ')).not.toContain('appear in none');

    // 6. The agent cannot publish; a person must confirm.
    const agentPublish = await rpcResult(
      await rpc('/mcp/twitter-agent', writerKey, 'tools/call', {
        name: 'publish_twitter_post',
        arguments: {
          projectKey: 'MKT',
          draftId: draft.id,
          version: 1,
          contentHash: draft.contentHash,
          accountId: 'ch_x',
          timezone: 'UTC',
          confirm: true,
        },
      }),
    );
    expect(agentPublish.isError).toBe(true);
    expect(creates()).toHaveLength(0);

    // 7. The person validates, confirms and schedules (mocked Buffer).
    const scheduledFor = new Date(Date.now() + 3 * 60 * 60_000).toISOString();
    const validation = await twitter(asOwner).drafts({ draftId: draft.id }).validate.post({
      accountId: 'ch_x',
      mode: 'schedule',
      scheduledFor,
      timezone: 'Europe/Amsterdam',
    });
    expect(validation.data!.ok).toBe(true);
    const scheduled = await twitter(asOwner).drafts({ draftId: draft.id }).schedule.post({
      version: 1,
      contentHash: validation.data!.contentHash,
      accountId: 'ch_x',
      timezone: 'Europe/Amsterdam',
      scheduledFor,
      confirm: true,
    });
    expect(scheduled.data!.status).toBe('scheduled');

    // 8. Activity holds the whole chain under the draft's correlation id.
    await sweep();
    const chain = await twitter(asOwner).activity.get({
      query: { correlationId: draft.correlationId },
    });
    expect(chain.data!.map((a) => a.event)).toEqual(
      expect.arrayContaining([
        'twitter.draft.created',
        'twitter.publish.requested',
        'twitter.publish.completed',
        'obsidian.ingest.completed',
      ]),
    );
    const requested = chain.data!.find((a) => a.event === 'twitter.publish.requested')!;
    expect(requested.actorName).toBe('Owner');
    const sourceAfter = await twitter(asOwner).items.get({ query: { ids: source.id } });
    expect(sourceAfter.data![0]!.draftIds).toEqual([draft.id]);
    expect(existsSync(path.join(vault, 'Socials/Twitter/Published/bp_1.md'))).toBe(true);
  });
});
