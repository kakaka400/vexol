import { Elysia, t } from 'elysia';
import { mcpTool } from '../mcp/generate';
import { requireUser } from '../shared/access';
import { authContext } from '../shared/auth-context';
import { guards } from '../shared/guards';
import { HttpError } from '../shared/lib';
import { ErrorResponse } from '../shared/responses';
import {
  fetchBufferPost,
  findSentBufferPost,
  listBufferChannels,
  resolveBufferKey,
  sendToBuffer,
} from '../twitter/publish';
import { beginPost, finishPost, getPost, listPosts } from './store';

export const LINKEDIN_MAX_LENGTH = 3000;
export const LINKEDIN_MAX_IMAGES = 9;

const AGENT = 'linkedin-agent' as const;

const projectParams = t.Object({ projectKey: t.String() });
const postParams = t.Object({ projectKey: t.String(), postId: t.String({ format: 'uuid' }) });

const errors = {
  400: ErrorResponse,
  401: ErrorResponse,
  403: ErrorResponse,
  404: ErrorResponse,
};
const bufferErrors = { 502: ErrorResponse, 503: ErrorResponse };

const Channel = t.Object({
  id: t.String(),
  platform: t.String(),
  username: t.String(),
  displayName: t.String(),
  profilePicture: t.Nullable(t.String()),
  connected: t.Boolean(),
});

const Post = t.Object({
  id: t.String(),
  text: t.String(),
  imageUrls: t.Array(t.String()),
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

function scheduleTime(mode: 'now' | 'schedule', value: string | undefined): Date | null {
  if (mode === 'now') return null;
  const when = value ? new Date(value) : null;
  if (!when || Number.isNaN(when.getTime())) throw new HttpError(400, 'Choose a date and time');
  if (when.getTime() < Date.now() + 60_000)
    throw new HttpError(400, 'The scheduled time must be at least a minute ahead');
  if (when.getTime() > Date.now() + 365 * 24 * 60 * 60_000)
    throw new HttpError(400, 'The scheduled time is more than a year ahead');
  return when;
}

// LinkedIn posts go out through the project's Buffer account, the same one the
// Twitter section uses.
export const linkedinRoutes = new Elysia({ name: 'linkedin', detail: { tags: ['LinkedIn'] } })
  .use(authContext)
  .use(guards)

  .get(
    '/projects/:projectKey/linkedin/channels',
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
        channels: await listBufferChannels(apiKey, 'linkedin'),
      };
    },
    {
      params: projectParams,
      permission: ['linkedin', 'read'],
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
        summary: 'List the LinkedIn channels connected in Buffer',
        description:
          'The LinkedIn profiles and pages of the project Buffer account a post can go to.',
        ...mcpTool('list_linkedin_channels', undefined, AGENT),
      },
    },
  )

  .get('/projects/:projectKey/linkedin/posts', ({ project }) => listPosts(project.id), {
    params: projectParams,
    permission: ['linkedin', 'read'],
    response: { 200: t.Array(Post), ...errors },
    detail: {
      summary: 'List the LinkedIn posts sent to Buffer, newest first',
      ...mcpTool('list_linkedin_posts', undefined, AGENT),
    },
  })

  .post(
    '/projects/:projectKey/linkedin/posts',
    async ({ project, body, user, set }) => {
      const text = body.text.trim();
      if (!text) throw new HttpError(400, 'Write the post text');
      const scheduledFor = scheduleTime(body.mode, body.scheduledFor);
      const apiKey = await resolveBufferKey(project.id);
      const channel = (await listBufferChannels(apiKey, 'linkedin')).find(
        (candidate) => candidate.id === body.channelId,
      );
      if (!channel)
        throw new HttpError(400, 'The chosen account is not a LinkedIn channel in Buffer');
      if (!channel.connected)
        throw new HttpError(400, `${channel.displayName} needs to be reconnected in Buffer`);

      const begun = await beginPost({
        projectId: project.id,
        idempotencyKey: body.idempotencyKey,
        text,
        imageUrls: body.imageUrls ?? [],
        channelId: channel.id,
        channelName: channel.displayName || channel.username,
        mode: body.mode,
        scheduledFor,
        userId: requireUser(user).id,
      });
      if (!begun.created) return begun.post;

      const outcome = await sendToBuffer(apiKey, {
        posts: [text],
        images: body.imageUrls ?? [],
        channelId: channel.id,
        mode: body.mode,
        scheduledFor,
      });
      set.status = 201;
      return finishPost(project.id, begun.post.id, outcome);
    },
    {
      params: projectParams,
      body: t.Object({
        text: t.String({ minLength: 1, maxLength: LINKEDIN_MAX_LENGTH }),
        imageUrls: t.Optional(
          t.Array(t.String({ pattern: '^https://', maxLength: 1000 }), {
            maxItems: LINKEDIN_MAX_IMAGES,
            description: 'Public https URLs of the images',
          }),
        ),
        channelId: t.String({ minLength: 1, maxLength: 64 }),
        mode: t.Union([t.Literal('now'), t.Literal('schedule')]),
        scheduledFor: t.Optional(t.String({ format: 'date-time' })),
        idempotencyKey: t.String({ format: 'uuid', description: 'A new random UUID per post' }),
      }),
      permission: ['linkedin', 'create'],
      response: { 200: Post, 201: Post, ...errors, ...bufferErrors },
      detail: {
        summary: 'Publish or schedule a LinkedIn post through Buffer',
        description:
          'Sends the post to the chosen LinkedIn channel in Buffer, now or at scheduledFor. A repeated idempotencyKey returns the earlier post without sending again.',
        ...mcpTool('create_linkedin_post', { openWorldHint: true }, AGENT),
      },
    },
  )

  .post(
    '/projects/:projectKey/linkedin/posts/:postId/refresh',
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
        text: post.text,
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
      permission: ['linkedin', 'read'],
      response: { 200: Post, ...errors, ...bufferErrors },
      detail: {
        summary: 'Refresh the status of a LinkedIn post from Buffer',
        ...mcpTool('refresh_linkedin_post', { idempotentHint: true, openWorldHint: true }, AGENT),
      },
    },
  );
