import { describe, expect, it } from 'bun:test';
import { hermesAgentForUsername, resolveHermesAgent } from '../../registry';

describe('Hermes agent registry', () => {
  it('resolves Bob to the fixed default profile and key variable', () => {
    expect(resolveHermesAgent('bob')).toMatchObject({
      slug: 'bob',
      profile: 'default',
      pathPrefix: '/p/default',
      apiKeyEnv: 'HERMES_BOB_API_KEY',
      projectKeyEnv: 'HERMES_BOB_PROJECT_KEY',
    });
  });

  it('resolves Vera to the fixed vera-social profile and key variable', () => {
    expect(resolveHermesAgent('vera')).toMatchObject({
      slug: 'vera',
      profile: 'vera-social',
      pathPrefix: '/p/vera-social',
      apiKeyEnv: 'HERMES_VERA_API_KEY',
      projectKeyEnv: 'HERMES_VERA_PROJECT_KEY',
    });
  });

  it('maps agent usernames to their route', () => {
    expect(hermesAgentForUsername('bob-agent')?.slug).toBe('bob');
    expect(hermesAgentForUsername('vera')?.slug).toBe('vera');
    expect(hermesAgentForUsername('vera-social')).toBeNull();
  });

  it('rejects arbitrary agent and profile names', () => {
    expect(resolveHermesAgent('vexol-lead-sourcing')).toBeNull();
    expect(resolveHermesAgent('vera-social')).toBeNull();
    expect(resolveHermesAgent('../default')).toBeNull();
    expect(resolveHermesAgent('scout')).toBeNull();
    expect(resolveHermesAgent('constructor')).toBeNull();
  });
});
