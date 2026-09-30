import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { HttpError } from '../shared/lib';
import type { PermissionAction, PermissionResource } from '../shared/permissions';
import { generateStudioPost, MAX_INSTRUCTION_LENGTH } from '../studio/generate';
import { postDto } from '../studio/dto';
import { listStudioPosts, listStudioTemplates } from '../studio/store';
import type { BobContext } from './identity';
import { requireBob, requireBobRead } from './identity';
import { logBobFailure } from './log';
import { sanitizeErrorCode } from './security';
import {
  getDashboardSummary,
  getScopedCommandCenter,
  getScopedProject,
  getScopedTask,
  listScopedAgentRuns,
  listScopedBraindump,
  listScopedCompetitorAlerts,
  listScopedCompetitors,
  listScopedMindFacts,
  listScopedProjects,
  listScopedTasks,
} from './store';

const PAGE_SIZE = 50;
const pageInput = {
  page: z.number().int().min(1).max(1_000).default(1),
  pageSize: z.number().int().min(1).max(PAGE_SIZE).default(20),
};
const genericItem = z.record(z.string(), z.unknown());
const pageOutput = {
  items: z.array(genericItem).max(PAGE_SIZE),
  page: z.number().int(),
  pageSize: z.number().int().max(PAGE_SIZE),
};

export interface BobRequestAudit {
  // Carried from the transport so a failure line can be tied to the request the
  // client saw, and to its audit row.
  requestId: string;
  startedAt: number;
  toolName: string;
  resourceId: string | null;
  resultStatus: 'success' | 'error' | 'denied';
  recordCount: number;
  errorCode: string | null;
}

function recordCount(value: Record<string, unknown>): number {
  if (Array.isArray(value.items)) return value.items.length;
  if (Array.isArray(value.tasks)) return value.tasks.length;
  return 1;
}

function safeMessage(code: string): string {
  if (code === 'not_found') return 'Resource not found';
  if (code === 'forbidden') return 'Resource is not available';
  if (code === 'timeout') return 'Request timed out';
  return 'Request failed';
}

export function buildBobMcpServer(context: BobContext, audit: BobRequestAudit): McpServer {
  const server = new McpServer(
    { name: 'vexol-bob', title: 'Vexol Bob', version: '1.1.0' },
    {
      capabilities: { tools: {} },
      instructions:
        'Access to the configured Vexol project. create_studio_post is the only tool that changes data: it generates a new image from a Studio template. Every other tool only reads; never claim that one changed data.',
    },
  );

  async function run(
    resource: PermissionResource,
    resourceId: string | null,
    operation: () => Promise<Record<string, unknown>> | Record<string, unknown>,
    action: PermissionAction = 'read',
  ) {
    audit.resourceId = resourceId;
    try {
      requireBob(context, resource, action);
      const result = await operation();
      audit.resultStatus = 'success';
      audit.recordCount = recordCount(result);
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result) }],
        structuredContent: result,
      };
    } catch (error) {
      // A 4xx HttpError carries a message written for the caller ("Template 3 has
      // no photo yet"), which an agent needs to correct its request.
      if (error instanceof HttpError && error.status < 500) {
        audit.resultStatus = 'error';
        audit.errorCode = 'invalid_request';
        return { content: [{ type: 'text' as const, text: error.message }], isError: true };
      }
      const code = sanitizeErrorCode(error);
      audit.resultStatus = code === 'forbidden' || code === 'not_found' ? 'denied' : 'error';
      audit.errorCode = code;
      // Denials are the guard working as intended; only real faults are logged.
      if (audit.resultStatus === 'error') {
        logBobFailure(
          {
            requestId: audit.requestId,
            toolName: audit.toolName,
            durationMs: Math.max(0, Math.round(performance.now() - audit.startedAt)),
            errorCode: code,
          },
          error,
        );
      }
      return {
        content: [{ type: 'text' as const, text: safeMessage(code) }],
        isError: true,
      };
    }
  }

  server.registerTool(
    'get_dashboard_summary',
    {
      description: 'Get bounded project, task, and agent-run totals for the configured project.',
      outputSchema: {
        activeProjects: z.number().int(),
        openTasks: z.number().int(),
        agentRuns: genericItem,
        recentAgentRuns: z.array(genericItem).max(10),
        recentErrors: z.array(genericItem).max(5),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    },
    () =>
      run('dashboards', null, () => {
        requireBobRead(context, 'work_items');
        return getDashboardSummary(context);
      }),
  );

  server.registerTool(
    'get_command_center',
    {
      description:
        'What needs attention in the project today: overdue work, blocked items, overdue ' +
        'invoices, failed agent runs and refused server connections, each with a count. ' +
        'Read this first when asked what to do today.',
      outputSchema: {
        generatedAt: z.string(),
        focusId: z.string().nullable(),
        signals: z.array(genericItem).max(20),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    },
    () => run('dashboards', null, () => getScopedCommandCenter(context)),
  );

  server.registerTool(
    'list_projects',
    {
      description: 'List only the configured Vexol project with bounded pagination.',
      inputSchema: {
        status: z.enum(['active']).optional(),
        search: z.string().trim().min(1).max(100).optional(),
        ...pageInput,
      },
      outputSchema: { ...pageOutput, total: z.number().int() },
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    },
    (input) => run('work_items', null, () => listScopedProjects(context, input)),
  );

  server.registerTool(
    'get_project',
    {
      description: 'Get one project and at most 20 recent tasks in the configured scope.',
      inputSchema: { projectId: z.number().int().positive() },
      outputSchema: {
        id: z.number().int(),
        key: z.string(),
        name: z.string(),
        status: z.literal('active'),
        summary: z.string(),
        createdAt: z.string(),
        tasks: z.array(genericItem).max(20),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    },
    ({ projectId }) =>
      run('work_items', String(projectId), () => getScopedProject(context, projectId)),
  );

  server.registerTool(
    'list_tasks',
    {
      description:
        'List tasks in the configured project with validated filters and bounded pagination.',
      inputSchema: {
        stateType: z.enum(['backlog', 'unstarted', 'started', 'completed', 'canceled']).optional(),
        priority: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
        search: z.string().trim().min(1).max(100).optional(),
        includeArchived: z.boolean().default(false),
        ...pageInput,
      },
      outputSchema: { ...pageOutput, hasMore: z.boolean() },
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    },
    (input) => run('work_items', null, () => listScopedTasks(context, input)),
  );

  server.registerTool(
    'get_task',
    {
      description: 'Get one task in the configured project.',
      inputSchema: { taskId: z.number().int().positive() },
      outputSchema: {
        id: z.number().int(),
        identifier: z.string(),
        sequenceNumber: z.number().int(),
        title: z.string(),
        priority: z.string().nullable(),
        status: z.string(),
        stateType: z.string(),
        dueDate: z.string().nullable(),
        startDate: z.string().nullable(),
        createdAt: z.string(),
        updatedAt: z.string(),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    },
    ({ taskId }) => run('work_items', String(taskId), () => getScopedTask(context, taskId)),
  );

  server.registerTool(
    'list_braindump_entries',
    {
      description: 'List captured thoughts from Braindump with bounded pagination.',
      inputSchema: {
        kind: z.enum(['idea', 'task', 'note', 'voice']).optional(),
        days: z.number().int().min(1).max(365).optional(),
        search: z.string().trim().min(1).max(100).optional(),
        ...pageInput,
      },
      outputSchema: { ...pageOutput, hasMore: z.boolean() },
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    },
    (input) => run('braindump', null, () => listScopedBraindump(context, input)),
  );

  server.registerTool(
    'list_mind_facts',
    {
      description:
        "List facts from the operation's shared memory, most trusted first. Read these before acting.",
      inputSchema: {
        category: z
          .enum([
            'goals',
            'routines',
            'people',
            'clients',
            'infra',
            'business',
            'knowledge',
            'daily_notes',
            'archive',
          ])
          .optional(),
        status: z.enum(['unverified', 'verified', 'flagged', 'conflicted']).optional(),
        search: z.string().trim().min(1).max(100).optional(),
        ...pageInput,
      },
      outputSchema: { ...pageOutput, hasMore: z.boolean() },
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    },
    (input) => run('mind', null, () => listScopedMindFacts(context, input)),
  );

  server.registerTool(
    'list_competitors',
    {
      description: 'List the rival social accounts being watched, with their latest reading.',
      inputSchema: { ...pageInput },
      outputSchema: { ...pageOutput, hasMore: z.boolean() },
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    },
    (input) => run('competitors', null, () => listScopedCompetitors(context, input)),
  );

  server.registerTool(
    'list_competitor_alerts',
    {
      description: 'List what changed on the watched rival accounts, newest first.',
      inputSchema: { ...pageInput },
      outputSchema: { ...pageOutput, hasMore: z.boolean() },
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    },
    (input) => run('competitors', null, () => listScopedCompetitorAlerts(context, input)),
  );

  server.registerTool(
    'list_agent_runs',
    {
      description: 'List durable project agent runs with sanitized error codes.',
      inputSchema: {
        agentType: z.enum(['external', 'internal']).optional(),
        status: z.enum(['pending', 'success', 'failed']).optional(),
        since: z.iso.datetime({ offset: true }).optional(),
        ...pageInput,
      },
      outputSchema: { ...pageOutput, hasMore: z.boolean() },
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    },
    (input) => run('dashboards', null, () => listScopedAgentRuns(context, input)),
  );

  server.registerTool(
    'list_studio_templates',
    {
      description:
        'List the six Studio templates. Each is a photo that create_studio_post edits; the description says what the template is meant for. A template without a photo cannot be used yet.',
      outputSchema: { items: z.array(genericItem).max(6) },
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    },
    () =>
      run('studio', null, async () => ({
        items: (await listStudioTemplates(context.project.id)).map((template) => ({
          slot: template.slot,
          name: template.name,
          description: template.description,
          hasPhoto: template.photoId != null,
        })),
      })),
  );

  server.registerTool(
    'list_studio_posts',
    {
      description:
        'List the images generated from the Studio templates, newest first, with a public image URL for each.',
      inputSchema: { limit: z.number().int().min(1).max(PAGE_SIZE).default(10) },
      outputSchema: { items: z.array(genericItem).max(PAGE_SIZE) },
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    },
    (input) =>
      run('studio', null, async () => ({
        items: (await listStudioPosts(context.project.id, input.limit)).map(postDto),
      })),
  );

  server.registerTool(
    'create_studio_post',
    {
      description:
        'Generate a new image by editing the photo of one Studio template with an instruction, for example the text to put on it or what to change. The template keeps its layout and style. Returns the new image with a public URL that can be sent to a chat. Takes up to two minutes.',
      inputSchema: {
        slot: z.number().int().min(1).max(6),
        instruction: z.string().trim().min(1).max(MAX_INSTRUCTION_LENGTH),
      },
      outputSchema: {
        id: z.string(),
        slot: z.number().int(),
        templateName: z.string(),
        instruction: z.string(),
        imageUrl: z.string().nullable(),
        createdByName: z.string().nullable(),
        createdAt: z.string(),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    (input) =>
      run(
        'studio',
        `slot:${input.slot}`,
        async () =>
          postDto(
            await generateStudioPost({
              projectId: context.project.id,
              slot: input.slot,
              instruction: input.instruction,
              userId: context.userId,
            }),
          ),
        'create',
      ),
  );

  return server;
}
