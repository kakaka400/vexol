import { aiAgent, db } from '@repo/db';
import { and, eq } from 'drizzle-orm';
import { getMemberContext } from '../members/store';
import { getProjectByKey, type ProjectRow } from '../projects/store';
import {
  hasPermission,
  type PermissionAction,
  type PermissionResource,
  type Permissions,
} from '../shared/permissions';
import { BOB_ACTOR, BobMcpError } from './security';

export interface BobContext {
  project: ProjectRow;
  userId: string;
  permissions: Permissions;
}

// The client always receives the same stable `unavailable` code; the message
// below reaches the server log only, and names which of the four deployment
// steps is missing. Without that, every one of them looks identical from the
// outside, which is what makes this failure expensive to diagnose.
export async function resolveBobContext(): Promise<BobContext> {
  const key = process.env.VEXOL_BOB_MCP_PROJECT_KEY;
  if (!key) {
    throw new BobMcpError('unavailable', 'VEXOL_BOB_MCP_PROJECT_KEY is not set');
  }
  const project = await getProjectByKey(key);
  if (!project) {
    throw new BobMcpError('unavailable', `No project has key ${key}`);
  }
  if (!project.mcpEnabled) {
    throw new BobMcpError('unavailable', `Project ${key} has MCP disabled`);
  }
  const [agent] = await db
    .select({ userId: aiAgent.userId })
    .from(aiAgent)
    .where(and(eq(aiAgent.projectId, project.id), eq(aiAgent.username, BOB_ACTOR)))
    .limit(1);
  if (!agent) {
    throw new BobMcpError('unavailable', `Project ${key} has no ${BOB_ACTOR} agent`);
  }
  const membership = await getMemberContext(project.id, agent.userId);
  if (!membership) {
    throw new BobMcpError('unavailable', `The ${BOB_ACTOR} agent is not a member of ${key}`);
  }
  return { project, userId: agent.userId, permissions: membership.permissions };
}

export function requireBobRead(context: BobContext, resource: PermissionResource): void {
  requireBob(context, resource, 'read');
}

export function requireBob(
  context: BobContext,
  resource: PermissionResource,
  action: PermissionAction,
): void {
  if (!hasPermission(context.permissions, resource, action)) {
    throw new BobMcpError('forbidden', 'Resource is not available');
  }
}
