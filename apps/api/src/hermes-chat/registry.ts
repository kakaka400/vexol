export interface HermesAgentRoute {
  slug: string;
  displayName: string;
  description: string;
  usernames: readonly string[];
  profile: string;
  pathPrefix: string;
  apiKeyEnv: string;
  projectKeyEnv: string;
  enabled: boolean;
}

// The name of the LinkedIn profile in Hermes.
const LINKEDIN_PROFILE = process.env.HERMES_LINKEDIN_PROFILE || 'linkedin';
// The name of the TikTok profile in Hermes.
const TIKTOK_PROFILE = process.env.HERMES_TIKTOK_PROFILE || 'tiktok';

const HERMES_AGENTS: Record<string, HermesAgentRoute> = {
  bob: {
    slug: 'bob',
    displayName: 'Bob',
    description: 'Primary assistant and orchestrator',
    usernames: ['bob', 'bob-agent'],
    profile: 'default',
    pathPrefix: '/p/default',
    apiKeyEnv: 'HERMES_BOB_API_KEY',
    projectKeyEnv: 'HERMES_BOB_PROJECT_KEY',
    enabled: true,
  },
  vera: {
    slug: 'vera',
    displayName: 'Vera',
    description: 'Social media content production',
    usernames: ['vera', 'vera-agent'],
    profile: 'vera-social',
    pathPrefix: '/p/vera-social',
    apiKeyEnv: 'HERMES_VERA_API_KEY',
    projectKeyEnv: 'HERMES_VERA_PROJECT_KEY',
    enabled: true,
  },
  linkedin: {
    slug: 'linkedin',
    displayName: 'LinkedIn agent',
    description: 'Writes, publishes and schedules LinkedIn posts through Buffer',
    usernames: ['linkedin', 'linkedin-agent'],
    profile: LINKEDIN_PROFILE,
    pathPrefix: `/p/${LINKEDIN_PROFILE}`,
    apiKeyEnv: 'HERMES_LINKEDIN_API_KEY',
    projectKeyEnv: 'HERMES_LINKEDIN_PROJECT_KEY',
    enabled: true,
  },
  tiktok: {
    slug: 'tiktok',
    displayName: 'TikTok agent',
    description: 'Makes animated TikTok videos and posts them through Buffer',
    usernames: ['tiktok', 'tiktok-agent'],
    profile: TIKTOK_PROFILE,
    pathPrefix: `/p/${TIKTOK_PROFILE}`,
    apiKeyEnv: 'HERMES_TIKTOK_API_KEY',
    projectKeyEnv: 'HERMES_TIKTOK_PROJECT_KEY',
    enabled: true,
  },
};

export function resolveHermesAgent(slug: string): HermesAgentRoute | null {
  const route = HERMES_AGENTS[slug];
  return route?.enabled ? route : null;
}

export function hermesAgentForUsername(username: string): HermesAgentRoute | null {
  const route = Object.values(HERMES_AGENTS).find((candidate) =>
    candidate.usernames.includes(username),
  );
  return route?.enabled ? route : null;
}

// A route is served only for the one project its environment variable names.
export function hermesAgentAllowed(route: HermesAgentRoute, projectKey: string): boolean {
  const allowed = process.env[route.projectKeyEnv];
  return !!allowed && allowed === projectKey;
}
