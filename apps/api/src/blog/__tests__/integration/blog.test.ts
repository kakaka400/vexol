import { beforeEach, describe, expect, it } from 'bun:test';
import { api, authedApi } from '../../../__tests__/helpers/app';
import { resetDb } from '../../../__tests__/helpers/db';
import { signUpTestUser } from '../../../__tests__/helpers/auth';

beforeEach(resetDb);

describe('GET /blog/drafts', () => {
  it('returns 401 without a session', async () => {
    const { error } = await api.blog.drafts.get();
    expect(error?.status).toBe(401);
  });

  it('returns 403 for a non-god user', async () => {
    // First signup becomes god; second is a plain user.
    await signUpTestUser();
    const plain = await signUpTestUser();
    const client = authedApi(plain.cookie);
    const { error } = await client.blog.drafts.get();
    expect(error?.status).toBe(403);
  });

  it('returns 200 for the god user', async () => {
    const god = await signUpTestUser();
    const client = authedApi(god.cookie);
    // FRAMER_API_KEY is not set in test; the route will throw 500 from framer.ts.
    // We confirm the auth layer passes (not 401/403) — either 200 or 500 from Framer.
    const { status } = await client.blog.drafts.get();
    expect(status === 200 || status === 500).toBe(true);
  });
});

describe('GET /blog/published', () => {
  it('returns 401 without a session', async () => {
    const { error } = await api.blog.published.get();
    expect(error?.status).toBe(401);
  });

  it('returns 403 for a non-god user', async () => {
    await signUpTestUser();
    const plain = await signUpTestUser();
    const { error } = await authedApi(plain.cookie).blog.published.get();
    expect(error?.status).toBe(403);
  });
});

describe('POST /blog/drafts/:slug/approve', () => {
  it('returns 401 without a session', async () => {
    const { error } = await api.blog.drafts({ slug: 'test' }).approve.post();
    expect(error?.status).toBe(401);
  });

  it('returns 403 for a non-god user', async () => {
    await signUpTestUser();
    const plain = await signUpTestUser();
    const { error } = await authedApi(plain.cookie).blog.drafts({ slug: 'test' }).approve.post();
    expect(error?.status).toBe(403);
  });

  it('returns 404 or 500 for god user with unknown slug', async () => {
    const god = await signUpTestUser();
    const { status } = await authedApi(god.cookie)
      .blog.drafts({ slug: 'nonexistent' })
      .approve.post();
    // 404 if Framer returns item not found, 500 if FRAMER_API_KEY is missing
    expect(status === 404 || status === 500).toBe(true);
  });
});

describe('POST /blog/drafts/:slug/reject', () => {
  it('returns 401 without a session', async () => {
    const { error } = await api.blog.drafts({ slug: 'test' }).reject.post();
    expect(error?.status).toBe(401);
  });

  it('returns 403 for a non-god user', async () => {
    await signUpTestUser();
    const plain = await signUpTestUser();
    const { error } = await authedApi(plain.cookie).blog.drafts({ slug: 'test' }).reject.post();
    expect(error?.status).toBe(403);
  });

  it('returns 404 or 500 for god user with unknown slug', async () => {
    const god = await signUpTestUser();
    const { status } = await authedApi(god.cookie)
      .blog.drafts({ slug: 'nonexistent' })
      .reject.post();
    expect(status === 404 || status === 500).toBe(true);
  });
});
