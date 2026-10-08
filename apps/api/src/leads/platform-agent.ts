import { createAgent, deleteAgent, listAgents, updateAgent } from '../ai-agents/store';
import { createRole, listRoles } from '../roles/store';
import { emptyPermissions } from '../shared/permissions';
import { HttpError } from '../shared/lib';
import type { LeadFormat } from './lead-input';
import { getPlatformByAgentId, updatePlatform, type PlatformRow } from './store';

// Every platform has one external agent in the Agents tab. The agent authenticates
// to the Vexol MCP endpoint with its own API key and acts under the "Lead scraper"
// role, which grants only the leads permissions its job tools need.

const SCRAPER_ROLE = 'Lead scraper';

async function scraperRoleId(projectId: number): Promise<number> {
  const existing = (await listRoles(projectId)).find((role) => role.name === SCRAPER_ROLE);
  if (existing) return existing.id;
  const permissions = emptyPermissions();
  permissions.leads = { read: true, create: true, edit: true, delete: false };
  return (await createRole(projectId, { name: SCRAPER_ROLE, permissions })).id;
}

export const agentName = (platform: { name: string }) => `${platform.name} Scraper`;

export interface PlatformAgent {
  id: number;
  name: string;
  username: string;
  apiKeyStart: string | null;
}

export async function platformAgents(projectId: number): Promise<Map<number, PlatformAgent>> {
  const agents = await listAgents(projectId);
  return new Map(
    agents.map((agent) => [
      agent.id,
      { id: agent.id, name: agent.name, username: agent.username, apiKeyStart: agent.apiKeyStart },
    ]),
  );
}

// Creates the platform's agent and returns its API key, which is shown once.
export async function connectPlatformAgent(projectId: number, platform: PlatformRow) {
  if (platform.agentId != null && (await platformAgents(projectId)).has(platform.agentId)) {
    throw new HttpError(409, 'This platform already has an agent');
  }
  const { agent, apiKey } = await createAgent(projectId, {
    name: agentName(platform),
    username: `${platform.slug}-scraper`,
    kind: 'external',
    roleId: await scraperRoleId(projectId),
  });
  await updatePlatform(platform.id, { agentId: agent.id });
  return { agentId: agent.id, apiKey: apiKey! };
}

export async function renamePlatformAgent(projectId: number, platform: PlatformRow, name: string) {
  if (platform.agentId == null) return;
  await updateAgent(platform.agentId, projectId, { name: agentName({ name }) });
}

export async function deletePlatformAgent(projectId: number, platform: PlatformRow) {
  if (platform.agentId == null) return;
  await deleteAgent(platform.agentId, projectId);
}

// The platform whose agent is the caller. A job tool called by anyone else is refused,
// so each agent sees and changes only its own platform's runs.
export async function callerPlatform(
  projectId: number,
  userId: string | undefined,
): Promise<PlatformRow> {
  const agent = (await listAgents(projectId)).find((a) => a.userId === userId);
  const platform = agent ? await getPlatformByAgentId(projectId, agent.id) : null;
  if (!platform) throw new HttpError(403, 'Only the agent of a scraper platform can use this tool');
  return platform;
}

// Sent with every job so the agent returns leads in the platform's lead format.
const FORMAT_RULES: Record<LeadFormat, string[]> = {
  email: [
    'Submit leads with submit_scrape_leads, as CSV with the header email,name,sector, or as the leads array with the same fields.',
    'One company and one email address per row. sector is a short sector name and may be empty.',
    'Email in lower case, without spaces, mailto: or brackets.',
    'name is the company name as shown on its own website, not a person name.',
    'Wrap a name that contains a comma in double quotes.',
    'Only include addresses the company publishes itself (website, contact page, business directory). Never guess an address.',
    'Skip invalid or obfuscated addresses such as "info [at] company".',
  ],
  social: [
    'Submit leads with submit_scrape_leads as the leads array, one object per account. Do not use csv and do not invent email addresses.',
    'Fields: handle (username without @), profileUrl (link to the account), name (display name), followers (follower count of the commenter as a number), comment (the exact comment text), commentedAt (date and time the comment was placed, ISO 8601), videoUrl (link to the video the comment is on), sector (short topic of the video).',
    'handle or profileUrl is required. Fill every other field you have; leave a field out when it is unknown, never guess it.',
    'An account the platform already has is skipped, so each account is stored once.',
    'Treat the niche as a topic, not as one hashtag. Search with the niche and with related keywords and hashtags: synonyms, sub-niches and adjacent terms (for "software": SaaS, B2B, startup, no-code, dev tools, productivity apps). Also search with every term in keywords.',
    'region is the country and language of the audience; scale is the follower range of the commenter’s own account; signal is what a comment must show for its author to count as a lead; maxLeads caps the leads of the job; notes holds extra instructions.',
  ],
};

export const leadFormatRules = (format: LeadFormat) => FORMAT_RULES[format].join('\n');
