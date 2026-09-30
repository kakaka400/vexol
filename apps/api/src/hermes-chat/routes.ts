import { Elysia, t } from 'elysia';
import { authContext } from '../shared/auth-context';
import { guards } from '../shared/guards';
import { requireUser } from '../shared/access';
import { HttpError } from '../shared/lib';
import { noContent } from '../shared/http';
import { ErrorResponse } from '../shared/responses';
import { getAgentById, listAgents } from '../ai-agents/store';
import { checkHermesReadiness, createHermesSession, openHermesChatStream } from './client';
import { mapHermesEvent } from './events';
import {
  hermesAgentAllowed,
  hermesAgentForUsername,
  resolveHermesAgent,
  type HermesAgentRoute,
} from './registry';
import { readHermesSse } from './sse';
import {
  archiveHermesConversation,
  beginHermesRun,
  completeHermesRun,
  enforceConversationCreateRateLimit,
  enforceMessageRateLimit,
  failHermesRun,
  getHermesConversation,
  insertHermesConversation,
  listHermesConversations,
  listHermesMessages,
} from './store';

const conversationParams = t.Object({ projectKey: t.String(), conversationId: t.String() });

function requestId(request: Request): string {
  const supplied = request.headers.get('x-request-id');
  return supplied &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(supplied)
    ? supplied
    : crypto.randomUUID();
}

function routeForAgent(projectKey: string, username: string): HermesAgentRoute {
  const route = hermesAgentForUsername(username);
  if (!route || !hermesAgentAllowed(route, projectKey)) {
    throw new HttpError(404, 'Hermes agent not found');
  }
  return route;
}

// A conversation keeps the agent it was created with, even after that agent's
// username changes.
function routeForConversation(projectKey: string, slug: string): HermesAgentRoute {
  const route = resolveHermesAgent(slug);
  if (!route || !hermesAgentAllowed(route, projectKey)) {
    throw new HttpError(404, 'Hermes agent not found');
  }
  return route;
}

async function boundAgent(agentId: number, projectId: number, projectKey: string) {
  const agent = await getAgentById(agentId, projectId);
  if (!agent) throw new HttpError(404, 'Hermes agent not found');
  return { agent, route: routeForAgent(projectKey, agent.username) };
}

const ConversationResponse = t.Object({
  id: t.String(),
  agentId: t.Number(),
  agentName: t.String(),
  agentSlug: t.String(),
  title: t.Nullable(t.String()),
  status: t.Union([t.Literal('active'), t.Literal('archived')]),
  createdAt: t.String(),
  updatedAt: t.String(),
});

export const hermesChatRoutes = new Elysia({
  name: 'hermes-chat',
  detail: { tags: ['AI Agents'] },
})
  .use(authContext)
  .use(guards)
  .get(
    '/projects/:projectKey/hermes-agents',
    async ({ project, params }) => {
      const served = (await listAgents(project.id)).flatMap((agent) => {
        const route = hermesAgentForUsername(agent.username);
        return route && hermesAgentAllowed(route, params.projectKey) ? [{ agent, route }] : [];
      });
      return Promise.all(
        served.map(async ({ agent, route }) => ({
          id: agent.id,
          slug: route.slug,
          displayName: agent.name,
          description: route.description,
          status: await checkHermesReadiness(route),
        })),
      );
    },
    {
      permission: ['ai_agents', 'read'],
      response: {
        200: t.Array(
          t.Object({
            id: t.Number(),
            slug: t.String(),
            displayName: t.String(),
            description: t.String(),
            status: t.Union([t.Literal('ready'), t.Literal('offline')]),
          }),
        ),
        401: ErrorResponse,
        403: ErrorResponse,
        404: ErrorResponse,
      },
      detail: { summary: 'List approved Hermes agents' },
    },
  )
  .post(
    '/projects/:projectKey/hermes-conversations',
    async ({ project, params, body, user, request, set }) => {
      const caller = requireUser(user);
      const { route } = await boundAgent(body.agentId, project.id, params.projectKey);
      await enforceConversationCreateRateLimit(project.id, caller.id);
      const title = body.title?.trim().slice(0, 120) || null;
      const id = requestId(request);
      const hermesSessionId = await createHermesSession(route, title, id);
      const conversation = await insertHermesConversation({
        projectId: project.id,
        userId: caller.id,
        agentId: body.agentId,
        hermesAgentSlug: route.slug,
        hermesSessionId,
        title,
      });
      console.info('[hermes-chat]', {
        actor: caller.id,
        conversationId: conversation.id,
        agentId: body.agentId,
        profile: route.profile,
        requestId: id,
        status: 'created',
      });
      set.status = 201;
      set.headers['x-request-id'] = id;
      return conversation;
    },
    {
      body: t.Object({
        agentId: t.Number(),
        title: t.Optional(t.String({ maxLength: 120 })),
      }),
      permission: ['ai_agents', 'read'],
      response: {
        201: ConversationResponse,
        400: ErrorResponse,
        401: ErrorResponse,
        403: ErrorResponse,
        404: ErrorResponse,
        429: ErrorResponse,
        502: ErrorResponse,
        503: ErrorResponse,
      },
      detail: { summary: 'Create a Hermes conversation' },
    },
  )
  .get(
    '/projects/:projectKey/hermes-conversations',
    ({ project, user, query }) =>
      listHermesConversations(project.id, requireUser(user).id, query.agentId),
    {
      query: t.Object({ agentId: t.Optional(t.Numeric()) }),
      permission: ['ai_agents', 'read'],
      response: {
        200: t.Array(ConversationResponse),
        400: ErrorResponse,
        401: ErrorResponse,
        403: ErrorResponse,
        404: ErrorResponse,
      },
      detail: { summary: 'List Hermes conversations' },
    },
  )
  .get(
    '/projects/:projectKey/hermes-conversations/:conversationId/messages',
    async ({ project, params, user }) => {
      const conversation = await getHermesConversation(
        params.conversationId,
        project.id,
        requireUser(user).id,
      );
      if (!conversation) throw new HttpError(404, 'Conversation not found');
      return listHermesMessages(conversation.id);
    },
    {
      params: conversationParams,
      permission: ['ai_agents', 'read'],
      response: {
        200: t.Array(
          t.Object({
            id: t.String(),
            role: t.Union([t.Literal('user'), t.Literal('assistant')]),
            text: t.String(),
            status: t.Union([t.Literal('completed'), t.Literal('failed')]),
            createdAt: t.String(),
          }),
        ),
        400: ErrorResponse,
        401: ErrorResponse,
        403: ErrorResponse,
        404: ErrorResponse,
      },
      detail: { summary: 'Get Hermes conversation messages' },
    },
  )
  .post(
    '/projects/:projectKey/hermes-conversations/:conversationId/messages/stream',
    async ({ project, params, body, user, request }) => {
      const caller = requireUser(user);
      const conversation = await getHermesConversation(
        params.conversationId,
        project.id,
        caller.id,
      );
      if (!conversation) throw new HttpError(404, 'Conversation not found');
      if (conversation.status !== 'active') throw new HttpError(409, 'Conversation is archived');
      const message = body.message.trim();
      if (!message) throw new HttpError(400, 'Message is required');
      const route = routeForConversation(params.projectKey, conversation.hermesAgentSlug);
      await enforceMessageRateLimit(project.id, caller.id);
      const id = requestId(request);
      const run = await beginHermesRun({
        conversationId: conversation.id,
        requestId: id,
        idempotencyKey: body.idempotencyKey,
        message,
      });
      const abort = new AbortController();
      let upstream: Response;
      try {
        upstream = await openHermesChatStream(
          route,
          conversation.hermesSessionId,
          message,
          id,
          abort.signal,
        );
      } catch (error) {
        await failHermesRun(run.runId, run.assistantMessageId, 'upstream_unavailable');
        throw error;
      }

      const encoder = new TextEncoder();
      let cancelled = false;
      const stream = new ReadableStream<Uint8Array>({
        async start(controller) {
          let assistantText = '';
          let completedContent: string | null = null;
          let eventId: string | null = null;
          let inputTokens: number | null = null;
          let outputTokens: number | null = null;
          let completed = false;
          let failed = false;
          let sequence = 0;
          const emit = (event: unknown) => {
            if (!cancelled)
              controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
          };
          try {
            for await (const event of readHermesSse(upstream.body!)) {
              sequence += 1;
              const payload =
                event.data && typeof event.data === 'object'
                  ? (event.data as Record<string, unknown>)
                  : {};
              if (event.event === 'assistant.delta' && typeof payload.delta === 'string') {
                assistantText += payload.delta;
              }
              if (event.event === 'assistant.completed') {
                if (typeof payload.content === 'string') completedContent = payload.content;
                if (typeof payload.message_id === 'string')
                  eventId = payload.message_id.slice(0, 512);
              }
              if (['error', 'run.failed', 'run.cancelled'].includes(event.event)) failed = true;
              if (event.event === 'run.completed') {
                const usage =
                  payload.usage && typeof payload.usage === 'object'
                    ? (payload.usage as Record<string, unknown>)
                    : {};
                inputTokens = typeof usage.input_tokens === 'number' ? usage.input_tokens : null;
                outputTokens = typeof usage.output_tokens === 'number' ? usage.output_tokens : null;
                completed = true;
              }
              const mapped = mapHermesEvent(event.event, payload, id, sequence);
              if (mapped) emit(mapped);
            }
            if (!completed) throw new Error('upstream_disconnect');
            const finalText = completedContent ?? assistantText;
            // Hermes completes a turn whose model call failed with the provider's
            // error text as the reply. Such a turn produced no output tokens.
            if (failed || !finalText.trim() || outputTokens === 0) {
              throw new Error('upstream_failed');
            }
            if (!assistantText && finalText) emit({ type: 'text', value: finalText });
            await completeHermesRun({
              runId: run.runId,
              assistantMessageId: run.assistantMessageId,
              content: finalText,
              hermesEventId: eventId,
              inputTokens,
              outputTokens,
            });
            emit({ type: 'done', threadId: conversation.id });
            console.info('[hermes-chat]', {
              actor: caller.id,
              conversationId: conversation.id,
              agentId: conversation.agentId,
              profile: route.profile,
              requestId: id,
              status: 'completed',
            });
          } catch (error) {
            await failHermesRun(
              run.runId,
              run.assistantMessageId,
              error instanceof Error && error.message === 'upstream_failed'
                ? 'upstream_failed'
                : 'upstream_disconnected',
              assistantText,
            ).catch(() => undefined);
            emit({
              type: 'error',
              message: `${route.displayName} could not complete the response. You can send the message again.`,
            });
          } finally {
            if (!cancelled) controller.close();
          }
        },
        cancel() {
          cancelled = true;
          abort.abort();
        },
      });
      return new Response(stream, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'X-Accel-Buffering': 'no',
          'X-Request-Id': id,
        },
      });
    },
    {
      params: conversationParams,
      body: t.Object({
        message: t.String({ minLength: 1, maxLength: 65_536 }),
        idempotencyKey: t.String({ format: 'uuid' }),
      }),
      permission: ['ai_agents', 'read'],
      response: {
        200: t.Any(),
        400: ErrorResponse,
        401: ErrorResponse,
        403: ErrorResponse,
        404: ErrorResponse,
        409: ErrorResponse,
        429: ErrorResponse,
        502: ErrorResponse,
        503: ErrorResponse,
      },
      detail: { summary: 'Stream a Hermes conversation response' },
    },
  )
  .delete(
    '/projects/:projectKey/hermes-conversations/:conversationId',
    async ({ project, params, user }) => {
      const archived = await archiveHermesConversation(
        params.conversationId,
        project.id,
        requireUser(user).id,
      );
      if (!archived) throw new HttpError(404, 'Conversation not found');
      return noContent();
    },
    {
      params: conversationParams,
      permission: ['ai_agents', 'read'],
      response: {
        204: t.Void(),
        400: ErrorResponse,
        401: ErrorResponse,
        403: ErrorResponse,
        404: ErrorResponse,
      },
      detail: { summary: 'Archive a Hermes conversation' },
    },
  );
