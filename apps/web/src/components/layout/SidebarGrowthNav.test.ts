import { describe, expect, it } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { isTwitterPath, socialPath, twitterPath } from '@/utils/paths';

const source = await readFile(new URL('./SidebarGrowthNav.tsx', import.meta.url), 'utf8');

describe('SidebarGrowthNav', () => {
  it('places Twitter directly under Social and before Studio', () => {
    const social = source.indexOf('label="Social"');
    const twitter = source.indexOf('label="Twitter"');
    const studio = source.indexOf('label="Studio"');

    expect(social).toBeGreaterThan(-1);
    expect(twitter).toBeGreaterThan(social);
    expect(studio).toBeGreaterThan(twitter);
    expect(source.slice(social + 'label="Social"'.length, twitter)).not.toContain('label="');
    expect(source.slice(twitter + 'label="Twitter"'.length, studio)).not.toContain('label="');
  });

  it('renders Twitter with the shared sidebar item, like its neighbours', () => {
    const items = source.match(/<SidebarNavItem/g) ?? [];
    expect(items).toHaveLength(4);
    expect(source).toContain("can('twitter', 'read')");
  });

  it('marks only Twitter active on the Twitter route', () => {
    expect(twitterPath('VEX')).toBe('/project/VEX/social/twitter');
    expect(isTwitterPath('/project/VEX/social/twitter')).toBe(true);
    expect(isTwitterPath('/project/VEX/social/twitter/anything')).toBe(true);
    expect(isTwitterPath(socialPath('VEX'))).toBe(false);
    expect(isTwitterPath('/project/VEX/social/twitterx')).toBe(false);
    expect(source).toContain("active={pathname.includes('/social') && !onTwitter}");
    expect(source).toContain('active={onTwitter}');
  });
});
