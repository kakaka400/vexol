import { Elysia, t } from 'elysia';
import { mcpTool } from '../mcp/generate';
import { requireUser } from '../shared/access';
import { authContext } from '../shared/auth-context';
import { guards } from '../shared/guards';
import { noContent } from '../shared/http';
import { HttpError } from '../shared/lib';
import { ErrorResponse } from '../shared/responses';
import {
  fetchBufferPost,
  findSentBufferPost,
  listBufferChannels,
  resolveBufferKey,
  scheduledTime,
  sendToBuffer,
} from '../twitter/publish';
import {
  beginPost,
  createDraft,
  createTemplate,
  deleteDraft,
  deleteTemplate,
  finishPost,
  getDraft,
  getPost,
  getTemplate,
  listDrafts,
  listPosts,
  listTemplates,
  updateDraft,
  updateTemplate,
} from './store';

export const TIKTOK_CAPTION_MAX_LENGTH = 2200;

const AGENT = 'tiktok-agent' as const;

const projectParams = t.Object({ projectKey: t.String() });
const templateParams = t.Object({
  projectKey: t.String(),
  templateId: t.String({ format: 'uuid' }),
});
const draftParams = t.Object({ projectKey: t.String(), draftId: t.String({ format: 'uuid' }) });
const postParams = t.Object({ projectKey: t.String(), postId: t.String({ format: 'uuid' }) });

const errors = {
  400: ErrorResponse,
  401: ErrorResponse,
  403: ErrorResponse,
  404: ErrorResponse,
};
const bufferErrors = { 502: ErrorResponse, 503: ErrorResponse };

// The animation a prompt describes. Shared by templates and drafts.
const AnimationInput = {
  prompt: t.String({ minLength: 1, maxLength: 5000, description: 'What the animation shows' }),
  colors: t.Array(t.String({ pattern: '^#[0-9a-fA-F]{6}$' }), {
    maxItems: 12,
    description: 'Hex colors, e.g. #1a2b3c',
  }),
  style: t.String({ maxLength: 500, description: 'Visual style, e.g. flat 2D, neon' }),
  durationSeconds: t.Integer({ minimum: 1, maximum: 600 }),
};
const animationOutput = {
  prompt: t.String(),
  colors: t.Array(t.String()),
  style: t.String(),
  durationSeconds: t.Number(),
};
const videoUrl = t.String({
  pattern: '^https://',
  maxLength: 2000,
  description: 'Public https URL of the rendered video',
});

const Template = t.Object({
  id: t.String(),
  name: t.String(),
  ...animationOutput,
  createdAt: t.String(),
  updatedAt: t.String(),
});

const Draft = t.Object({
  id: t.String(),
  templateId: t.Nullable(t.String()),
  title: t.String(),
  ...animationOutput,
  caption: t.String(),
  videoUrl: t.Nullable(t.String()),
  createdByName: t.Nullable(t.String()),
  createdAt: t.String(),
  updatedAt: t.String(),
});

const Post = t.Object({
  id: t.String(),
  draftId: t.Nullable(t.String()),
  caption: t.String(),
  videoUrl: t.String(),
  channelId: t.String(),
  channelName: t.Nullable(t.String()),
  mode: t.Union([t.Literal('now'), t.Literal('schedule')]),
  scheduledFor: t.Nullable(t.String()),
  status: t.Union([
    t.Literal('pending'),
    t.Literal('unknown'),
    t.Literal('scheduled'),
    t.Literal('published'),
    t.Literal('failed'),
  ]),
  bufferPostId: t.Nullable(t.String()),
  platformPostUrl: t.Nullable(t.String()),
  lastError: t.Nullable(t.String()),
  createdByName: t.Nullable(t.String()),
  createdAt: t.String(),
  updatedAt: t.String(),
});

const Channel = t.Object({
  id: t.String(),
  platform: t.String(),
  username: t.String(),
  displayName: t.String(),
  profilePicture: t.Nullable(t.String()),
  connected: t.Boolean(),
});

async function templateOr404(projectId: number, templateId: string) {
  const template = await getTemplate(projectId, templateId);
  if (!template) throw new HttpError(404, 'Template not found');
  return template;
}

async function draftOr404(projectId: number, draftId: string) {
  const draft = await getDraft(projectId, draftId);
  if (!draft) throw new HttpError(404, 'Draft not found');
  return draft;
}

// TikTok videos are prompted in the library, rendered by the TikTok agent into a
// draft, and posted through the project's Buffer account.
export const tiktokRoutes = new Elysia({ name: 'tiktok', detail: { tags: ['TikTok'] } })
  .use(authContext)
  .use(guards)

  // ------------------------------------------------ library
  .get('/projects/:projectKey/tiktok/templates', ({ project }) => listTemplates(project.id), {
    params: projectParams,
    permission: ['tiktok', 'read'],
    response: { 200: t.Array(Template), ...errors },
    detail: {
      summary: 'List the prompt templates of the TikTok library',
      ...mcpTool('list_tiktok_templates', undefined, AGENT),
    },
  })

  .post(
    '/projects/:projectKey/tiktok/templates',
    async ({ project, body, set }) => {
      set.status = 201;
      return createTemplate(project.id, body);
    },
    {
      params: projectParams,
      body: t.Object({ name: t.String({ minLength: 1, maxLength: 120 }), ...AnimationInput }),
      permission: ['tiktok', 'create'],
      response: { 201: Template, ...errors },
      detail: {
        summary: 'Add a prompt template to the TikTok library',
        ...mcpTool('create_tiktok_template', undefined, AGENT),
      },
    },
  )

  .patch(
    '/projects/:projectKey/tiktok/templates/:templateId',
    async ({ project, params, body }) =>
      (await updateTemplate(project.id, params.templateId, body)) ??
      templateOr404(project.id, params.templateId),
    {
      params: templateParams,
      body: t.Partial(
        t.Object({ name: t.String({ minLength: 1, maxLength: 120 }), ...AnimationInput }),
      ),
      permission: ['tiktok', 'edit'],
      response: { 200: Template, ...errors },
      detail: { summary: 'Change a prompt template' },
    },
  )

  .delete(
    '/projects/:projectKey/tiktok/templates/:templateId',
    async ({ project, params }) => {
      if (!(await deleteTemplate(project.id, params.templateId)))
        throw new HttpError(404, 'Template not found');
      return noContent();
    },
    {
      params: templateParams,
      permission: ['tiktok', 'delete'],
      response: { 204: t.Void(), ...errors },
      detail: { summary: 'Delete a prompt template' },
    },
  )

  // ------------------------------------------------ drafts
  .get('/projects/:projectKey/tiktok/drafts', ({ project }) => listDrafts(project.id), {
    params: projectParams,
    permission: ['tiktok', 'read'],
    response: { 200: t.Array(Draft), ...errors },
    detail: {
      summary: 'List the TikTok drafts, last changed first',
      ...mcpTool('list_tiktok_drafts', undefined, AGENT),
    },
  })

  .get(
    '/projects/:projectKey/tiktok/drafts/:draftId',
    ({ project, params }) => draftOr404(project.id, params.draftId),
    {
      params: draftParams,
      permission: ['tiktok', 'read'],
      response: { 200: Draft, ...errors },
      detail: {
        summary: 'Get a TikTok draft',
        ...mcpTool('get_tiktok_draft', undefined, AGENT),
      },
    },
  )

  .post(
    '/projects/:projectKey/tiktok/drafts',
    async ({ project, body, user, set }) => {
      const template = body.templateId ? await templateOr404(project.id, body.templateId) : null;
      const prompt = body.prompt ?? template?.prompt;
      if (!prompt) throw new HttpError(400, 'Write a prompt or choose a template');
      set.status = 201;
      return createDraft(project.id, requireUser(user).id, {
        templateId: template?.id ?? null,
        title: body.title,
        prompt,
        colors: body.colors ?? template?.colors ?? [],
        style: body.style ?? template?.style ?? '',
        durationSeconds: body.durationSeconds ?? template?.durationSeconds ?? 15,
        caption: body.caption ?? '',
        videoUrl: body.videoUrl ?? null,
      });
    },
    {
      params: projectParams,
      body: t.Object({
        title: t.String({ minLength: 1, maxLength: 200 }),
        templateId: t.Optional(
          t.String({
            format: 'uuid',
            description: 'Library template whose fields fill the ones not given',
          }),
        ),
        prompt: t.Optional(AnimationInput.prompt),
        colors: t.Optional(AnimationInput.colors),
        style: t.Optional(AnimationInput.style),
        durationSeconds: t.Optional(AnimationInput.durationSeconds),
        caption: t.Optional(t.String({ maxLength: TIKTOK_CAPTION_MAX_LENGTH })),
        videoUrl: t.Optional(videoUrl),
      }),
      permission: ['tiktok', 'create'],
      response: { 201: Draft, ...errors },
      detail: {
        summary: 'Create a TikTok draft',
        description:
          'Create a draft from a prompt, or from a library template. The fields not given are taken from the template.',
        ...mcpTool('create_tiktok_draft', undefined, AGENT),
      },
    },
  )

  .patch(
    '/projects/:projectKey/tiktok/drafts/:draftId',
    async ({ project, params, body }) =>
      (await updateDraft(project.id, params.draftId, body)) ??
      draftOr404(project.id, params.draftId),
    {
      params: draftParams,
      body: t.Partial(
        t.Object({
          title: t.String({ minLength: 1, maxLength: 200 }),
          ...AnimationInput,
          caption: t.String({ maxLength: TIKTOK_CAPTION_MAX_LENGTH }),
          videoUrl: t.Nullable(videoUrl),
        }),
      ),
      permission: ['tiktok', 'edit'],
      response: { 200: Draft, ...errors },
      detail: {
        summary: 'Change a TikTok draft',
        description:
          'Change the prompt, colors, style, duration, caption or the video of a draft. Set videoUrl to the rendered video once it is made.',
        ...mcpTool('update_tiktok_draft', undefined, AGENT),
      },
    },
  )

  .delete(
    '/projects/:projectKey/tiktok/drafts/:draftId',
    async ({ project, params }) => {
      if (!(await deleteDraft(project.id, params.draftId)))
        throw new HttpError(404, 'Draft not found');
      return noContent();
    },
    {
      params: draftParams,
      permission: ['tiktok', 'delete'],
      response: { 204: t.Void(), ...errors },
      detail: { summary: 'Delete a TikTok draft' },
    },
  )

  // ------------------------------------------------ publishing (Buffer)
  .get(
    '/projects/:projectKey/tiktok/channels',
    async ({ project }) => {
      let apiKey: string;
      try {
        apiKey = await resolveBufferKey(project.id);
      } catch (error) {
        return {
          configured: false,
          error: error instanceof HttpError ? error.message : 'Buffer is not configured',
          channels: [],
        };
      }
      return {
        configured: true,
        error: null,
        channels: await listBufferChannels(apiKey, 'tiktok'),
      };
    },
    {
      params: projectParams,
      permission: ['tiktok', 'read'],
      response: {
        200: t.Object({
          configured: t.Boolean(),
          error: t.Nullable(t.String()),
          channels: t.Array(Channel),
        }),
        ...errors,
        ...bufferErrors,
      },
      detail: {
        summary: 'List the TikTok channels connected in Buffer',
        ...mcpTool('list_tiktok_channels', undefined, AGENT),
      },
    },
  )

  .get('/projects/:projectKey/tiktok/posts', ({ project }) => listPosts(project.id), {
    params: projectParams,
    permission: ['tiktok', 'read'],
    response: { 200: t.Array(Post), ...errors },
    detail: {
      summary: 'List the TikTok posts sent to Buffer, newest first',
      ...mcpTool('list_tiktok_posts', undefined, AGENT),
    },
  })

  .post(
    '/projects/:projectKey/tiktok/drafts/:draftId/publish',
    async ({ project, params, body, user, set }) => {
      const draft = await draftOr404(project.id, params.draftId);
      if (!draft.videoUrl) throw new HttpError(400, 'The draft has no video yet');
      const scheduledFor = scheduledTime(body.mode, body.scheduledFor);
      const apiKey = await resolveBufferKey(project.id);
      const channel = (await listBufferChannels(apiKey, 'tiktok')).find(
        (candidate) => candidate.id === body.channelId,
      );
      if (!channel)
        throw new HttpError(400, 'The chosen account is not a TikTok channel in Buffer');
      if (!channel.connected)
        throw new HttpError(400, `${channel.displayName} needs to be reconnected in Buffer`);

      const begun = await beginPost({
        projectId: project.id,
        draftId: draft.id,
        idempotencyKey: body.idempotencyKey,
        caption: draft.caption,
        videoUrl: draft.videoUrl,
        channelId: channel.id,
        channelName: channel.displayName || channel.username,
        mode: body.mode,
        scheduledFor,
        userId: requireUser(user).id,
      });
      if (!begun.created) return begun.post;

      const outcome = await sendToBuffer(apiKey, {
        posts: [draft.caption],
        images: [],
        videos: [draft.videoUrl],
        channelId: channel.id,
        mode: body.mode,
        scheduledFor,
      });
      set.status = 201;
      return finishPost(project.id, begun.post.id, outcome);
    },
    {
      params: draftParams,
      body: t.Object({
        channelId: t.String({ minLength: 1, maxLength: 64 }),
        mode: t.Union([t.Literal('now'), t.Literal('schedule')]),
        scheduledFor: t.Optional(t.String({ format: 'date-time' })),
        idempotencyKey: t.String({ format: 'uuid', description: 'A new random UUID per post' }),
      }),
      permission: ['tiktok', 'create'],
      response: { 200: Post, 201: Post, ...errors, ...bufferErrors },
      detail: {
        summary: 'Publish or schedule a TikTok draft through Buffer',
        description:
          'Sends the video and caption of the draft to the chosen TikTok channel in Buffer, now or at scheduledFor. The draft needs a videoUrl. A repeated idempotencyKey returns the earlier post without sending again.',
        ...mcpTool('publish_tiktok_draft', { openWorldHint: true }, AGENT),
      },
    },
  )

  .post(
    '/projects/:projectKey/tiktok/posts/:postId/refresh',
    async ({ project, params }) => {
      const post = await getPost(project.id, params.postId);
      if (!post) throw new HttpError(404, 'Post not found');
      if (post.status !== 'scheduled' && post.status !== 'unknown') return post;
      const apiKey = await resolveBufferKey(project.id);
      if (post.status === 'scheduled' && post.bufferPostId) {
        const found = await fetchBufferPost(apiKey, post.bufferPostId);
        return found ? finishPost(project.id, post.id, found) : post;
      }
      const found = await findSentBufferPost(apiKey, {
        channelId: post.channelId,
        text: post.caption,
        since: new Date(post.createdAt),
      });
      return finishPost(
        project.id,
        post.id,
        found ?? { kind: 'refused', error: 'Buffer has no record of this post, it was not sent' },
      );
    },
    {
      params: postParams,
      permission: ['tiktok', 'read'],
      response: { 200: Post, ...errors, ...bufferErrors },
      detail: {
        summary: 'Refresh the status of a TikTok post from Buffer',
        ...mcpTool('refresh_tiktok_post', { idempotentHint: true, openWorldHint: true }, AGENT),
      },
    },
  );
