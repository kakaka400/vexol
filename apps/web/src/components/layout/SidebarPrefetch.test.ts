import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

const sources = [
  'SidebarNavItem.tsx',
  'SidebarCommandCenterItem.tsx',
  'SidebarNavSubmenuCollapsible.tsx',
  'SidebarNavSubmenuMenu.tsx',
].map((name) => ({
  name,
  source: readFileSync(new URL(`./${name}`, import.meta.url), 'utf8'),
}));

describe('sidebar navigation prefetch', () => {
  test('does not eagerly prefetch every sidebar destination', () => {
    for (const { name, source } of sources) {
      expect(source, name).toContain('prefetch={false}');
    }
  });
});
