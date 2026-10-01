import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { authedApi, type Api } from '../../../__tests__/helpers/app';
import { signUpTestUser } from '../../../__tests__/helpers/auth';
import { resetDb } from '../../../__tests__/helpers/db';

// The Social dashboard reads Zernio with the project's own key from Settings →
// Integrations, falling back to the ZERNIO_API env key for ZERNIO_PROJECT_KEY only.

async function setup() {
  const owner = await signUpTestUser({ name: 'Owner' });
  const asOwner = authedApi(owner.cookie);
  await asOwner.projects.post({ key: 'MKT', name: 'Marketing' });
  return { asOwner };
}

const project = (api: Api) => api.projects({ projectKey: 'MKT' });

const realFetch = globalThis.fetch;
let zernioAuth: string[] = [];

// Answers Zernio calls with empty payloads and records the bearer each one sent.
function mockZernio() {
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = input instanceof Request ? input.url : String(input);
    if (!url.startsWith('https://zernio.com/')) return realFetch(input, init);
    zernioAuth.push(new Headers(init?.headers).get('Authorization') ?? '');
    return Response.json({});
  }) as typeof fetch;
}

describe('social dashboard', () => {
  const env = { api: process.env.ZERNIO_API, project: process.env.ZERNIO_PROJECT_KEY };

  beforeEach(async () => {
    await resetDb();
    zernioAuth = [];
    delete process.env.ZERNIO_API;
    delete process.env.ZERNIO_PROJECT_KEY;
    mockZernio();
  });

  afterEach(() => {
    globalThis.fetch = realFetch;
    process.env.ZERNIO_API = env.api;
    process.env.ZERNIO_PROJECT_KEY = env.project;
    if (env.api === undefined) delete process.env.ZERNIO_API;
    if (env.project === undefined) delete process.env.ZERNIO_PROJECT_KEY;
  });

  it('asks for a Zernio key when the project has none', async () => {
    const { asOwner } = await setup();
    const res = await project(asOwner).social.dashboard.get();
    expect(res.status).toBe(503);
    expect(JSON.stringify(res.error?.value)).toContain('Settings → Integrations');
    expect(zernioAuth).toHaveLength(0);
  });

  it("reads Zernio with the project's stored key", async () => {
    const { asOwner } = await setup();
    const created = await project(asOwner).integrations.post({
      integrationKey: 'zernio',
      credential: { apiKey: 'zk-project-key' },
    });
    expect(created.status).toBe(201);

    const res = await project(asOwner).social.dashboard.get();
    expect(res.status).toBe(200);
    expect(zernioAuth.length).toBeGreaterThan(0);
    expect(zernioAuth.every((h) => h === 'Bearer zk-project-key')).toBe(true);
  });

  it('falls back to the env key only for ZERNIO_PROJECT_KEY', async () => {
    const { asOwner } = await setup();
    process.env.ZERNIO_API = 'zk-env-key';
    process.env.ZERNIO_PROJECT_KEY = 'other';
    expect((await project(asOwner).social.dashboard.get()).status).toBe(503);

    process.env.ZERNIO_PROJECT_KEY = 'mkt';
    expect((await project(asOwner).social.dashboard.get()).status).toBe(200);
    expect(zernioAuth.every((h) => h === 'Bearer zk-env-key')).toBe(true);
  });
});
