import { describe, expect, it } from 'bun:test';
import { agentsPath, isLeadsPath, leadsPath } from './paths';

describe('AI Team paths', () => {
  it('builds the project-scoped Agents route', () => {
    expect(agentsPath('VEX')).toBe('/project/VEX/ai-team/agents');
  });
});

describe('Leads paths', () => {
  it('builds the project-scoped Leads route', () => {
    expect(leadsPath('VEX')).toBe('/project/VEX/leads');
  });

  it('matches the Leads route without matching another section', () => {
    expect(isLeadsPath('/project/VEX/leads')).toBe(true);
    expect(isLeadsPath('/project/VEX/accounting')).toBe(false);
  });
});
