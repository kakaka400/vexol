import { beforeEach, describe, expect, it } from 'bun:test';
import { apiKeyApi, authedApi, type Api } from '../../../__tests__/helpers/app';
import { signUpTestUser } from '../../../__tests__/helpers/auth';
import { resetDb } from '../../../__tests__/helpers/db';

const drafts = (api: Api, projectKey = 'MKT') => api.projects({ projectKey }).studio.drafts;

const tomorrow = () => new Date(Date.now() + 24 * 60 * 60_000).toISOString();

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

describe('Studio drafts', () => {
  beforeEach(resetDb);

  it('takes a draft from idea to a scheduled, approved version', async () => {
    const { asOwner } = await setup();
    const draft = await createDraft(asOwner);
    const byId = drafts(asOwner)({ draftId: draft.id });

    const requested = await byId['request-review'].post({ version: 1 });
    const approved = await byId.review.post({ version: 1, decision: 'approved' });
    const scheduledFor = tomorrow();
    const scheduled = await byId.schedule.post({
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
      byId.schedule.post({ version: 1, scheduledFor: tomorrow(), timezone: 'UTC' });

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
      version: 2,
      scheduledFor: tomorrow(),
      timezone: 'UTC',
    });
    const scheduleOld = await byId.schedule.post({
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
    await byId.schedule.post({ version: 1, scheduledFor: tomorrow(), timezone: 'UTC' });

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
    expect(detail.data).toMatchObject({ status: 'review_requested', createdByName: 'Vera' });
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
      version: 1,
      scheduledFor: tomorrow(),
      timezone: 'Mars/Olympus',
    });
    const past = await byId.schedule.post({
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
