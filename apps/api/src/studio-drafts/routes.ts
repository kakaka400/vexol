import { Elysia, t } from 'elysia';
import { authContext } from '../shared/auth-context';
import { requireUser } from '../shared/access';
import { guards } from '../shared/guards';
import { HttpError } from '../shared/lib';
import { ErrorResponse } from '../shared/responses';
import { isAgentUser } from '../ai-agents/store';
import {
  addStudioDraftVersion,
  createStudioDraft,
  getStudioDraft,
  listStudioDrafts,
  requestStudioDraftReview,
  reviewStudioDraft,
  scheduleStudioDraft,
  type StudioDraftContent,
} from './store';

const projectParams = t.Object({ projectKey: t.String() });
const draftParams = t.Object({ projectKey: t.String(), draftId: t.String({ format: 'uuid' }) });

// 2200 characters is the Instagram caption limit.
const contentFields = {
  caption: t.String({ minLength: 1, maxLength: 2200 }),
  templateSlot: t.Optional(t.Nullable(t.Integer({ minimum: 1, maximum: 6 }))),
  postId: t.Optional(t.Nullable(t.String({ format: 'uuid' }))),
};

const Status = t.Union([
  t.Literal('draft'),
  t.Literal('review_requested'),
  t.Literal('approved'),
  t.Literal('rejected'),
  t.Literal('scheduled'),
]);

const DraftSummary = t.Object({
  id: t.String(),
  platform: t.Literal('instagram'),
  status: Status,
  currentVersion: t.Number(),
  caption: t.String(),
  templateSlot: t.Nullable(t.Number()),
  imageUrl: t.Nullable(t.String()),
  createdByName: t.Nullable(t.String()),
  createdAt: t.String(),
  updatedAt: t.String(),
});

const DraftDetail = t.Composite([
  DraftSummary,
  t.Object({
    conversationId: t.Nullable(t.String()),
    versions: t.Array(
      t.Object({
        version: t.Number(),
        caption: t.String(),
        templateSlot: t.Nullable(t.Number()),
        postId: t.Nullable(t.String()),
        imageUrl: t.Nullable(t.String()),
        contentHash: t.String(),
        createdByName: t.Nullable(t.String()),
        createdAt: t.String(),
        review: t.Nullable(
          t.Object({
            decision: t.Union([t.Literal('approved'), t.Literal('rejected')]),
            reason: t.Nullable(t.String()),
            decidedByName: t.Nullable(t.String()),
            decidedAt: t.String(),
          }),
        ),
      }),
    ),
    schedule: t.Nullable(
      t.Object({
        version: t.Number(),
        scheduledFor: t.String(),
        timezone: t.String(),
        createdByName: t.Nullable(t.String()),
        createdAt: t.String(),
      }),
    ),
  }),
]);

const errors = {
  400: ErrorResponse,
  401: ErrorResponse,
  403: ErrorResponse,
  404: ErrorResponse,
  409: ErrorResponse,
};

function content(body: {
  caption: string;
  templateSlot?: number | null;
  postId?: string | null;
}): StudioDraftContent {
  const caption = body.caption.trim();
  if (!caption) throw new HttpError(400, 'Caption is required');
  return { caption, templateSlot: body.templateSlot ?? null, postId: body.postId ?? null };
}

function isTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat('en', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

async function detail(projectId: number, draftId: string) {
  const draft = await getStudioDraft(projectId, draftId);
  if (!draft) throw new HttpError(404, 'Draft not found');
  return draft;
}

export const studioDraftRoutes = new Elysia({
  name: 'studio-drafts',
  detail: { tags: ['Studio'] },
})
  .use(authContext)
  .use(guards)

  .get('/projects/:projectKey/studio/drafts', ({ project }) => listStudioDrafts(project.id), {
    params: projectParams,
    permission: ['studio', 'read'],
    response: { 200: t.Array(DraftSummary), ...errors },
    detail: { summary: 'List Studio drafts, most recently changed first' },
  })

  .post(
    '/projects/:projectKey/studio/drafts',
    async ({ project, body, user, set }) => {
      const draftId = await createStudioDraft({
        projectId: project.id,
        userId: requireUser(user).id,
        conversationId: body.conversationId ?? null,
        idempotencyKey: body.idempotencyKey,
        content: content(body),
      });
      set.status = 201;
      return detail(project.id, draftId);
    },
    {
      params: projectParams,
      body: t.Object({
        ...contentFields,
        conversationId: t.Optional(t.Nullable(t.String({ format: 'uuid' }))),
        idempotencyKey: t.String({ format: 'uuid' }),
      }),
      permission: ['studio', 'create'],
      response: { 201: DraftDetail, ...errors },
      detail: { summary: 'Create a Studio draft' },
    },
  )

  .get(
    '/projects/:projectKey/studio/drafts/:draftId',
    ({ project, params }) => detail(project.id, params.draftId),
    {
      params: draftParams,
      permission: ['studio', 'read'],
      response: { 200: DraftDetail, ...errors },
      detail: { summary: 'Get a Studio draft with its versions, reviews and schedule' },
    },
  )

  .post(
    '/projects/:projectKey/studio/drafts/:draftId/versions',
    async ({ project, params, body, user }) => {
      await addStudioDraftVersion({
        projectId: project.id,
        draftId: params.draftId,
        userId: requireUser(user).id,
        baseVersion: body.baseVersion,
        content: content(body),
      });
      return detail(project.id, params.draftId);
    },
    {
      params: draftParams,
      body: t.Object({ ...contentFields, baseVersion: t.Integer({ minimum: 1 }) }),
      permission: ['studio', 'edit'],
      response: { 200: DraftDetail, ...errors },
      detail: { summary: 'Save new content as the next version of a draft' },
    },
  )

  .post(
    '/projects/:projectKey/studio/drafts/:draftId/request-review',
    async ({ project, params, body }) => {
      await requestStudioDraftReview(project.id, params.draftId, body.version);
      return detail(project.id, params.draftId);
    },
    {
      params: draftParams,
      body: t.Object({ version: t.Integer({ minimum: 1 }) }),
      permission: ['studio', 'edit'],
      response: { 200: DraftDetail, ...errors },
      detail: { summary: 'Send the current version of a draft for human review' },
    },
  )

  .post(
    '/projects/:projectKey/studio/drafts/:draftId/review',
    async ({ project, params, body, user }) => {
      const caller = requireUser(user);
      // Agents, Vera included, have their own user rows. A review is a human decision.
      if (await isAgentUser(caller.id)) {
        throw new HttpError(403, 'Only a person can review a draft');
      }
      const reason = body.reason?.trim() || null;
      if (body.decision === 'rejected' && !reason) {
        throw new HttpError(400, 'A rejection needs a reason');
      }
      await reviewStudioDraft({
        projectId: project.id,
        draftId: params.draftId,
        version: body.version,
        decision: body.decision,
        reason,
        userId: caller.id,
      });
      return detail(project.id, params.draftId);
    },
    {
      params: draftParams,
      body: t.Object({
        version: t.Integer({ minimum: 1 }),
        decision: t.Union([t.Literal('approved'), t.Literal('rejected')]),
        reason: t.Optional(t.String({ maxLength: 1000 })),
      }),
      permission: ['studio', 'edit'],
      response: { 200: DraftDetail, ...errors },
      detail: { summary: 'Approve or reject one version of a draft' },
    },
  )

  .post(
    '/projects/:projectKey/studio/drafts/:draftId/schedule',
    async ({ project, params, body, user }) => {
      if (!isTimeZone(body.timezone)) throw new HttpError(400, 'Unknown time zone');
      const scheduledFor = new Date(body.scheduledFor);
      if (scheduledFor.getTime() <= Date.now()) {
        throw new HttpError(400, 'The scheduled time must be in the future');
      }
      await scheduleStudioDraft({
        projectId: project.id,
        draftId: params.draftId,
        version: body.version,
        scheduledFor,
        timezone: body.timezone,
        userId: requireUser(user).id,
      });
      return detail(project.id, params.draftId);
    },
    {
      params: draftParams,
      body: t.Object({
        version: t.Integer({ minimum: 1 }),
        scheduledFor: t.String({ format: 'date-time' }),
        timezone: t.String({ minLength: 1, maxLength: 64 }),
      }),
      permission: ['studio', 'edit'],
      response: { 200: DraftDetail, ...errors },
      detail: { summary: 'Schedule the approved version of a draft' },
    },
  );
