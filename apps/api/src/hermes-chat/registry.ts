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
