import { describe, expect, it } from 'bun:test';
import { readFile } from 'node:fs/promises';
import {
  isLinkedinPath,
  isTiktokPath,
  isTwitterPath,
  linkedinPath,
  socialPath,
  tiktokPath,
  twitterPath,
} from '@/utils/paths';

const source = await readFile(new URL('./SidebarGrowthNav.tsx', import.meta.url), 'utf8');

describe('SidebarGrowthNav', () => {
  it('places Twitter, TikTok and LinkedIn directly under Social', () => {
    const labels = [...source.matchAll(/label="([^"]+)"/g)].map((match) => match[1]);
    expect(labels.slice(0, 4)).toEqual(['Social', 'Twitter', 'TikTok', 'LinkedIn']);
    expect(labels).toContain('Studio');
  });

  it('renders each section with the shared sidebar item behind its own permission', () => {
    const items = source.match(/<SidebarNavItem/g) ?? [];
    expect(items).toHaveLength(7);
    expect(source).toContain("can('twitter', 'read')");
    expect(source).toContain("can('tiktok', 'read')");
    expect(source).toContain("can('linkedin', 'read')");
  });

  it('marks only the section of the current route active', () => {
    expect(twitterPath('VEX')).toBe('/project/VEX/social/twitter');
    expect(tiktokPath('VEX')).toBe('/project/VEX/social/tiktok');
    expect(linkedinPath('VEX')).toBe('/project/VEX/social/linkedin');
    for (const [match, path] of [
      [isTwitterPath, twitterPath('VEX')],
      [isTiktokPath, tiktokPath('VEX')],
      [isLinkedinPath, linkedinPath('VEX')],
    ] as const) {
      expect(match(path)).toBe(true);
      expect(match(`${path}/anything`)).toBe(true);
      expect(match(`${path}x`)).toBe(false);
      expect(match(socialPath('VEX'))).toBe(false);
    }
    expect(source).toContain(
      "active={pathname.includes('/social') && !onTwitter && !onLinkedin && !onTiktok}",
    );
    expect(source).toContain('active={onTwitter}');
    expect(source).toContain('active={onTiktok}');
    expect(source).toContain('active={onLinkedin}');
  });
});
