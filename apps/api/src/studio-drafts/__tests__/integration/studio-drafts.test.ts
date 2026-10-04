import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { apiKeyApi, authedApi, type Api } from '../../../__tests__/helpers/app';
import { signUpTestUser } from '../../../__tests__/helpers/auth';
import { resetDb } from '../../../__tests__/helpers/db';

const drafts = (api: Api, projectKey = 'MKT') => api.projects({ projectKey }).studio.drafts;

const tomorrow = () => new Date(Date.now() + 24 * 60 * 60_000).toISOString();

const LINKEDIN = [{ accountId: 'acc_li', platform: 'linkedin', format: 'post' as const }];

// Zernio is the only thing reached over the network. Each call is recorded, and a
// test can make the next post creation fail.
const realFetch = globalThis.fetch;
let zernioCalls: { method: string; path: string; headers: Headers; body: unknown }[] = [];
let zernioFailure: { status: number; body: unknown } | null = null;

function mockZernio() {
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (url.host !== 'zernio.com') return realFetch(input, init);
    const method = init?.method ?? 'GET';
    zernioCalls.push({
      method,
      path: url.pathname,
      headers: new Headers(init?.headers),
      body: init?.body ? JSON.parse(String(init.body)) : null,
    });
    if (url.pathname.endsWith('/accounts')) {
      return Response.json({
        accounts: [
          { _id: 'acc_ig', platform: 'instagram', username: 'vexol', displayName: 'Vexol' },
          { _id: 'acc_li', platform: 'linkedin', username: 'vexol-li', needsReconnection: true },
        ],
      });
    }
    if (zernioFailure) return Response.json(zernioFailure.body, { status: zernioFailure.status });
    return Response.json({ post: { _id: 'zp_1', status: 'scheduled' } }, { status: 201 });
  }) as typeof fetch;
}

async function setup() {
  const owner = await signUpTestUser({ name: 'Owner' });
  const asOwner = authedApi(owner.cookie);
  await asOwner.projects.post({ key: 'MKT', name: 'Marketing' });
  return { owner, asOwner };
}

async function createDraft(api: Api, caption = 'Autumn launch') {
  const created = await drafts(api).post({ caption, idempotencyKey: crypto.randomUUID() });
  expect(created.status).toBe(201);
  return created.data!;
}

async function approvedDraft(api: Api) {
  const draft = await createDraft(api);
  await drafts(api)({ draftId: draft.id })['request-review'].post({ version: 1 });
  await drafts(api)({ draftId: draft.id }).review.post({ version: 1, decision: 'approved' });
  return draft;
}

// An external agent like Vera, with a role that can make and edit drafts.
async function veraAgent(asOwner: Api) {
  const role = await asOwner.projects({ projectKey: 'MKT' }).roles.post({
    name: 'Studio editor',
    permissions: { studio: { read: true, create: true, edit: true } },
  });
  const vera = await asOwner.projects({ projectKey: 'MKT' })['ai-agents'].post({
    name: 'Vera',
    username: 'vera',
    kind: 'external',
    roleId: role.data!.id,
  });
  return apiKeyApi(vera.data!.apiKey!);
}

describe('Studio drafts', () => {
  const env = { api: process.env.ZERNIO_API, project: process.env.ZERNIO_PROJECT_KEY };

  beforeEach(async () => {
    await resetDb();
    zernioCalls = [];
    zernioFailure = null;
    process.env.ZERNIO_API = 'zk-test';
    process.env.ZERNIO_PROJECT_KEY = 'MKT';
    mockZernio();
  });

  afterEach(() => {
    globalThis.fetch = realFetch;
    for (const [name, value] of [
      ['ZERNIO_API', env.api],
      ['ZERNIO_PROJECT_KEY', env.project],
    ] as const) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  });

  it('takes a draft from idea to a scheduled, approved version', async () => {
    const { asOwner } = await setup();
    const draft = await createDraft(asOwner);
    const byId = drafts(asOwner)({ draftId: draft.id });

    const requested = await byId['request-review'].post({ version: 1 });
    const approved = await byId.review.post({ version: 1, decision: 'approved' });
    const scheduledFor = tomorrow();
    const scheduled = await byId.schedule.post({
      targets: LINKEDIN,
      version: 1,
      scheduledFor,
      timezone: 'Europe/Amsterdam',
    });

    expect(draft).toMatchObject({ status: 'draft', currentVersion: 1, caption: 'Autumn launch' });
    expect(requested.data?.status).toBe('review_requested');
    expect(approved.data?.status).toBe('approved');
    expect(approved.data?.versions[0]?.review).toMatchObject({
      decision: 'approved',
      decidedByName: 'Owner',
    });
    expect(scheduled.status).toBe(200);
    expect(scheduled.data?.status).toBe('scheduled');
    expect(scheduled.data?.schedule).toMatchObject({
      version: 1,
      timezone: 'Europe/Amsterdam',
    });
    expect(new Date(scheduled.data!.schedule!.scheduledFor).toISOString()).toBe(scheduledFor);
    const listed = await drafts(asOwner).get();
    expect(listed.data?.map((row) => row.status)).toEqual(['scheduled']);
  });

  it('ignores status and identity fields sent by the browser', async () => {
    const { asOwner } = await setup();
    const created = await drafts(asOwner).post({
      caption: 'Try to skip review',
      idempotencyKey: crypto.randomUUID(),
      status: 'approved',
      createdBy: 'someone-else',
      hermesSessionId: 'session_x',
    } as never);

    expect(created.status).toBe(201);
    expect(created.data).toMatchObject({ status: 'draft', createdByName: 'Owner' });
  });

  it('refuses to schedule a version that is not approved', async () => {
    const { asOwner } = await setup();
    const draft = await createDraft(asOwner);
    const byId = drafts(asOwner)({ draftId: draft.id });
    const schedule = () =>
      byId.schedule.post({
        targets: LINKEDIN,
        version: 1,
        scheduledFor: tomorrow(),
        timezone: 'UTC',
      });

    const asDraft = await schedule();
    await byId['request-review'].post({ version: 1 });
    const inReview = await schedule();
    const missingReason = await byId.review.post({ version: 1, decision: 'rejected' });
    await byId.review.post({ version: 1, decision: 'rejected', reason: 'Off brand' });
    const rejected = await schedule();

    expect(asDraft.status).toBe(409);
    expect(inReview.status).toBe(409);
    expect(missingReason.status).toBe(400);
    expect(rejected.status).toBe(409);
    const detail = await byId.get();
    expect(detail.data?.versions[0]?.review).toMatchObject({
      decision: 'rejected',
      reason: 'Off brand',
    });
    expect(detail.data?.schedule).toBeNull();
  });

  it('creates a new version on edit, which the earlier approval does not cover', async () => {
    const { asOwner } = await setup();
    const draft = await approvedDraft(asOwner);
    const byId = drafts(asOwner)({ draftId: draft.id });

    const edited = await byId.versions.post({ baseVersion: 1, caption: 'Autumn launch, v2' });
    const scheduleNew = await byId.schedule.post({
      targets: LINKEDIN,
      version: 2,
      scheduledFor: tomorrow(),
      timezone: 'UTC',
    });
    const scheduleOld = await byId.schedule.post({
      targets: LINKEDIN,
      version: 1,
      scheduledFor: tomorrow(),
      timezone: 'UTC',
    });

    expect(edited.data).toMatchObject({ status: 'draft', currentVersion: 2 });
    expect(edited.data?.versions.map((version) => version.review?.decision ?? null)).toEqual([
      'approved',
      null,
    ]);
    expect(edited.data?.versions[0]?.contentHash).not.toBe(edited.data?.versions[1]?.contentHash);
    expect(scheduleNew.status).toBe(409);
    expect(scheduleOld.status).toBe(409);
  });

  it('rejects a review of a version the reviewer did not see and a repeated review', async () => {
    const { asOwner } = await setup();
    const draft = await createDraft(asOwner);
    const byId = drafts(asOwner)({ draftId: draft.id });
    await byId.versions.post({ baseVersion: 1, caption: 'Second' });
    await byId['request-review'].post({ version: 2 });

    const stale = await byId.review.post({ version: 1, decision: 'approved' });
    const first = await byId.review.post({ version: 2, decision: 'approved' });
    const repeated = await byId.review.post({ version: 2, decision: 'approved' });
    const staleEdit = await byId.versions.post({ baseVersion: 1, caption: 'Third' });

    expect(stale.status).toBe(409);
    expect(first.status).toBe(200);
    expect(repeated.status).toBe(409);
    expect(staleEdit.status).toBe(409);
  });

  it('keeps a scheduled draft locked', async () => {
    const { asOwner } = await setup();
    const draft = await approvedDraft(asOwner);
    const byId = drafts(asOwner)({ draftId: draft.id });
    await byId.schedule.post({
      targets: LINKEDIN,
      version: 1,
      scheduledFor: tomorrow(),
      timezone: 'UTC',
    });

    const edit = await byId.versions.post({ baseVersion: 1, caption: 'Changed' });

    expect(edit.status).toBe(409);
  });

  it('does not let an agent review a draft', async () => {
    const { asOwner } = await setup();
    const role = await asOwner.projects({ projectKey: 'MKT' }).roles.post({
      name: 'Studio editor',
      permissions: { studio: { read: true, create: true, edit: true } },
    });
    const vera = await asOwner.projects({ projectKey: 'MKT' })['ai-agents'].post({
      name: 'Vera',
      username: 'vera',
      kind: 'external',
      roleId: role.data!.id,
    });
    const asVera = apiKeyApi(vera.data!.apiKey!);
    const draft = await createDraft(asVera);
    const byId = drafts(asVera)({ draftId: draft.id });
    await byId['request-review'].post({ version: 1 });

    const review = await byId.review.post({ version: 1, decision: 'approved' });

    expect(review.status).toBe(403);
    expect(review.error?.value).toEqual({ error: 'Only a person can review a draft' });
    const detail = await drafts(asOwner)({ draftId: draft.id }).get();
    expect(detail.data).toMatchObject({
      status: 'review_requested',
      createdByName: 'Vera',
      createdByAgent: true,
    });
  });

  it('marks drafts made by an agent, and only those', async () => {
    const { asOwner } = await setup();
    await createDraft(asOwner, 'By a person');
    const asVera = await veraAgent(asOwner);
    await createDraft(asVera, 'By Vera');

    const listed = await drafts(asOwner).get();
    const byCaption = Object.fromEntries(
      (listed.data ?? []).map((row) => [row.caption, row.createdByAgent]),
    );
    expect(byCaption).toEqual({ 'By a person': false, 'By Vera': true });
  });

  it('does not let an agent schedule a draft', async () => {
    const { asOwner } = await setup();
    const asVera = await veraAgent(asOwner);
    const draft = await approvedDraft(asOwner);

    const scheduled = await drafts(asVera)({ draftId: draft.id }).schedule.post({
      targets: LINKEDIN,
      version: 1,
      scheduledFor: tomorrow(),
      timezone: 'UTC',
    });

    expect(scheduled.status).toBe(403);
    expect(zernioCalls).toHaveLength(0);
  });

  it('hands the approved version to Zernio once, at the wall-clock time of its zone', async () => {
    const { asOwner } = await setup();
    const draft = await approvedDraft(asOwner);
    const scheduledFor = new Date(Date.now() + 2 * 24 * 60 * 60_000);
    scheduledFor.setUTCHours(8, 30, 0, 0);

    const scheduled = await drafts(asOwner)({ draftId: draft.id }).schedule.post({
      version: 1,
      scheduledFor: scheduledFor.toISOString(),
      timezone: 'Europe/Amsterdam',
      targets: LINKEDIN,
    });

    expect(scheduled.status).toBe(200);
    expect(scheduled.data?.schedule).toMatchObject({ targets: LINKEDIN, zernioPostId: 'zp_1' });
    expect(zernioCalls).toHaveLength(1);
    const call = zernioCalls[0]!;
    expect(call).toMatchObject({ method: 'POST', path: '/api/v1/posts' });
    expect(call.headers.get('authorization')).toBe('Bearer zk-test');
    expect(call.headers.get('idempotency-key')).toBe(`studio-${draft.id}-v1`);
    const wall = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Europe/Amsterdam',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).format(scheduledFor);
    expect(call.body).toMatchObject({
      content: 'Autumn launch',
      mediaItems: [],
      platforms: [{ platform: 'linkedin', accountId: 'acc_li' }],
      timezone: 'Europe/Amsterdam',
    });
    expect((call.body as { scheduledFor: string }).scheduledFor).toEndWith(`T${wall}:00`);
  });

  it('refuses Instagram content it cannot post, before calling Zernio', async () => {
    const { asOwner } = await setup();
    const draft = await approvedDraft(asOwner);
    const schedule = (targets: { accountId: string; platform: string; format: string }[]) =>
      drafts(asOwner)({ draftId: draft.id }).schedule.post({
        version: 1,
        scheduledFor: tomorrow(),
        timezone: 'UTC',
        targets: targets as typeof LINKEDIN,
      });

    const noImage = await schedule([
      { accountId: 'acc_ig', platform: 'instagram', format: 'post' },
    ]);
    const reel = await schedule([{ accountId: 'acc_ig', platform: 'instagram', format: 'reel' }]);
    const storyElsewhere = await schedule([
      { accountId: 'acc_li', platform: 'linkedin', format: 'story' },
    ]);
    const twice = await schedule([...LINKEDIN, ...LINKEDIN]);

    expect(noImage.status).toBe(400);
    expect(reel.status).toBe(400);
    expect(reel.error?.value).toEqual({
      error: 'An Instagram Reel needs a video. Studio images can go out as a post or a story.',
    });
    expect(storyElsewhere.status).toBe(400);
    expect(twice.status).toBe(400);
    expect(zernioCalls).toHaveLength(0);
    expect((await drafts(asOwner)({ draftId: draft.id }).get()).data?.status).toBe('approved');
  });

  it("keeps the draft approved when Zernio refuses, with Zernio's reason", async () => {
    const { asOwner } = await setup();
    const draft = await approvedDraft(asOwner);
    zernioFailure = { status: 422, body: { error: 'Account acc_li is disconnected' } };

    const scheduled = await drafts(asOwner)({ draftId: draft.id }).schedule.post({
      version: 1,
      scheduledFor: tomorrow(),
      timezone: 'UTC',
      targets: LINKEDIN,
    });

    expect(scheduled.status).toBe(502);
    expect(scheduled.error?.value).toEqual({
      error: 'Zernio refused: Account acc_li is disconnected',
    });
    const detail = await drafts(asOwner)({ draftId: draft.id }).get();
    expect(detail.data).toMatchObject({ status: 'approved', schedule: null });
  });

  it('lists the Zernio accounts a draft can go to', async () => {
    const { asOwner } = await setup();

    const accounts = await asOwner.projects({ projectKey: 'MKT' }).studio['publish-accounts'].get();

    expect(accounts.status).toBe(200);
    expect(accounts.data).toEqual([
      {
        id: 'acc_ig',
        platform: 'instagram',
        username: 'vexol',
        displayName: 'Vexol',
        profilePicture: null,
        connected: true,
      },
      {
        id: 'acc_li',
        platform: 'linkedin',
        username: 'vexol-li',
        displayName: '',
        profilePicture: null,
        connected: false,
      },
    ]);
  });

  it('keeps drafts inside their project', async () => {
    const { asOwner } = await setup();
    const draft = await createDraft(asOwner);
    const other = await signUpTestUser({ name: 'Other' });
    const asOther = authedApi(other.cookie);
    await asOther.projects.post({ key: 'OPS', name: 'Operations' });

    const direct = await drafts(asOther)({ draftId: draft.id }).get();
    const throughOwnProject = await drafts(asOther, 'OPS')({ draftId: draft.id }).get();
    const approveAcross = await drafts(
      asOther,
      'OPS',
    )({ draftId: draft.id }).review.post({
      version: 1,
      decision: 'approved',
    });
    const modified = await drafts(asOwner)({ draftId: crypto.randomUUID() }).get();

    expect(direct.status).toBe(403);
    expect(throughOwnProject.status).toBe(404);
    expect(approveAcross.status).toBe(404);
    expect(modified.status).toBe(404);
    expect((await drafts(asOther, 'OPS').get()).data).toEqual([]);
  });

  it('refuses a conversation or image from outside the project', async () => {
    const { asOwner } = await setup();

    const conversation = await drafts(asOwner).post({
      caption: 'Linked',
      conversationId: crypto.randomUUID(),
      idempotencyKey: crypto.randomUUID(),
    });
    const image = await drafts(asOwner).post({
      caption: 'With image',
      postId: crypto.randomUUID(),
      idempotencyKey: crypto.randomUUID(),
    });
    const path = await drafts(asOwner).post({
      caption: 'Path',
      postId: '../../etc/passwd',
      idempotencyKey: crypto.randomUUID(),
    } as never);

    expect(conversation.status).toBe(404);
    expect(image.status).toBe(404);
    expect(path.status).toBe(400);
    expect((await drafts(asOwner).get()).data).toEqual([]);
  });

  it('creates a draft once per idempotency key', async () => {
    const { asOwner } = await setup();
    const idempotencyKey = crypto.randomUUID();

    const first = await drafts(asOwner).post({ caption: 'Once', idempotencyKey });
    const retry = await drafts(asOwner).post({ caption: 'Once', idempotencyKey });

    expect(first.status).toBe(201);
    expect(retry.status).toBe(409);
    expect((await drafts(asOwner).get()).data).toHaveLength(1);
  });

  it('validates caption, slot, time zone and scheduled time', async () => {
    const { asOwner } = await setup();
    const post = (body: Record<string, unknown>) =>
      drafts(asOwner).post({ idempotencyKey: crypto.randomUUID(), ...body } as never);

    expect((await post({ caption: '   ' })).status).toBe(400);
    expect((await post({ caption: 'x'.repeat(2200) })).status).toBe(201);
    expect((await post({ caption: 'x'.repeat(2201) })).status).toBe(400);
    expect((await post({ caption: 'Slot', templateSlot: 6 })).status).toBe(201);
    expect((await post({ caption: 'Slot', templateSlot: 7 })).status).toBe(400);

    const draft = await approvedDraft(asOwner);
    const byId = drafts(asOwner)({ draftId: draft.id });
    const zone = await byId.schedule.post({
      targets: LINKEDIN,
      version: 1,
      scheduledFor: tomorrow(),
      timezone: 'Mars/Olympus',
    });
    const past = await byId.schedule.post({
      targets: LINKEDIN,
      version: 1,
      scheduledFor: new Date(Date.now() - 60_000).toISOString(),
      timezone: 'UTC',
    });

    expect(zone.status).toBe(400);
    expect(past.status).toBe(400);
  });

  it('needs Studio permissions', async () => {
    const { asOwner } = await setup();
    const draft = await createDraft(asOwner);
    const role = await asOwner.projects({ projectKey: 'MKT' }).roles.post({
      name: 'Studio viewer',
      permissions: { studio: { read: true } },
    });
    const member = await signUpTestUser({ name: 'Viewer' });
    const invite = await asOwner
      .projects({ projectKey: 'MKT' })
      .invites.post({ email: member.email, role: 'member', roleId: role.data!.id });
    const asMember = authedApi(member.cookie);
    await asMember.invites({ token: invite.data!.token }).accept.post();

    const read = await drafts(asMember)({ draftId: draft.id }).get();
    const create = await drafts(asMember).post({
      caption: 'No',
      idempotencyKey: crypto.randomUUID(),
    });
    const review = await drafts(asMember)({ draftId: draft.id })['request-review'].post({
      version: 1,
    });

    expect(read.status).toBe(200);
    expect(create.status).toBe(403);
    expect(review.status).toBe(403);
  });
});
