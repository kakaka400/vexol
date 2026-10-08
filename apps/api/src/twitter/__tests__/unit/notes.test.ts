import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { checkPosts, splitThread, unsourcedNumbers, weightedLength } from '../../compose';
import { itemNotePath, renderItemNote, runNotePath } from '../../notes';
import { readZernioPost, zernioBody } from '../../publish';
import { resolveInVault, safeSegment, writeVaultNote } from '../../vault';

const note = {
  id: 'i1',
  postId: '1852634789012345678',
  canonicalUrl: 'https://x.com/vexoleu/status/1852634789012345678',
  contentHash: 'a'.repeat(64),
  authorHandle: 'vexoleu',
  authorName: 'Vexol "EU"',
  profileUrl: 'https://x.com/vexoleu',
  text: 'Line one <script>alert(1)</script>\n---\ninjected: true',
  publishedAt: '2026-10-06T09:30:00.000Z',
  fetchedAt: '2026-10-07T12:00:00.000Z',
  language: 'en',
  metrics: { like_count: 12 },
  media: [],
  links: [],
  query: 'ai agents',
  relevance: null,
  adapter: 'x_api',
  verificationStatus: 'unverified',
  sourceStatus: 'ok',
  warnings: [],
  tags: ['ai', 'research'],
  run: { id: 'r1', notePath: 'Socials/Twitter/Research Runs/2026/10/x.md', label: 'ai agents' },
  drafts: [],
};

describe('Obsidian notes', () => {
  it('writes the frontmatter fields with quoted values', () => {
    const markdown = renderItemNote(note);
    const frontmatter = markdown.split('\n---\n')[0]!;
    for (const line of [
      'type: "twitter-research"',
      'platform: "x"',
      'post_id: "1852634789012345678"',
      'canonical_url: "https://x.com/vexoleu/status/1852634789012345678"',
      'author_handle: "vexoleu"',
      'author_name: "Vexol \\"EU\\""',
      'published_at: "2026-10-06T09:30:00.000Z"',
      'fetched_at: "2026-10-07T12:00:00.000Z"',
      'language: "en"',
      'research_run_id: "r1"',
      'query: "ai agents"',
      'verification_status: "unverified"',
      'source_status: "ok"',
      `content_hash: "${'a'.repeat(64)}"`,
      '  - "ai"',
    ]) {
      expect(frontmatter).toContain(line);
    }
  });

  it('keeps post text inside a quote block with markup escaped', () => {
    const markdown = renderItemNote(note);
    expect(markdown).toContain('> Line one &lt;script&gt;alert(1)&lt;/script&gt;');
    expect(markdown).toContain('> ---');
    expect(markdown).toContain('> injected: true');
    expect(markdown.match(/^---$/gm)).toHaveLength(2);
    expect(markdown).not.toContain('<script>');
  });

  it('links the run, the profile and the source, and separates inference from facts', () => {
    const markdown = renderItemNote(note);
    expect(markdown).toContain('[[Socials/Twitter/Research Runs/2026/10/x|ai agents]]');
    expect(markdown).toContain('[[Socials/Twitter/Profiles/vexoleu|@vexoleu]]');
    expect(markdown).toContain('<https://x.com/vexoleu/status/1852634789012345678>');
    expect(markdown).toContain('## Facts from the source');
    expect(markdown).toContain('## Why it is relevant (inference, not a fact from the source)');
  });

  it('names notes by post id or hash, and runs by date, query and id', () => {
    expect(itemNotePath({ postId: '123', contentHash: 'h' })).toBe('Socials/Twitter/Posts/123.md');
    expect(itemNotePath({ postId: null, contentHash: 'b'.repeat(64) })).toBe(
      `Socials/Twitter/Posts/${'b'.repeat(24)}.md`,
    );
    expect(
      runNotePath({
        id: '0fd1c2a3-0000-0000-0000-000000000000',
        createdAt: '2026-10-07T12:00:00.000Z',
        input: { question: 'What do people say about ../../AI?' },
      }),
    ).toBe(
      'Socials/Twitter/Research Runs/2026/10/2026-10-07--what-do-people-say-about-ai--0fd1c2a3.md',
    );
  });
});

describe('vault paths', () => {
  let vault: string;
  const original = process.env.OBSIDIAN_VAULT_DIR;

  beforeEach(async () => {
    vault = await mkdtemp(path.join(tmpdir(), 'vault-'));
    process.env.OBSIDIAN_VAULT_DIR = vault;
  });

  afterEach(async () => {
    process.env.OBSIDIAN_VAULT_DIR = original;
    await rm(vault, { recursive: true, force: true });
  });

  it('refuses paths that leave the vault', () => {
    for (const bad of [
      '../outside.md',
      'Socials/../../x.md',
      '/etc/passwd',
      'C:\\Windows\\x.md',
      'a\0b.md',
      'a//b.md',
    ]) {
      expect(() => resolveInVault(vault, bad)).toThrow();
    }
    expect(resolveInVault(vault, 'Socials/Twitter/Posts/1.md')).toBe(
      path.join(vault, 'Socials', 'Twitter', 'Posts', '1.md'),
    );
  });

  it('reduces a segment to safe characters', () => {
    expect(safeSegment('../../etc/passwd')).toBe('etc-passwd');
    expect(safeSegment('...')).toBe('untitled');
  });

  it('writes a note and overwrites it on a repeated write', async () => {
    await writeVaultNote('Socials/Twitter/Posts/1.md', 'first');
    await writeVaultNote('Socials/Twitter/Posts/1.md', 'second');
    expect(await readFile(path.join(vault, 'Socials/Twitter/Posts/1.md'), 'utf8')).toBe('second');
  });

  it('reports a missing vault as a permanent error', async () => {
    delete process.env.OBSIDIAN_VAULT_DIR;
    await expect(writeVaultNote('Socials/Twitter/x.md', 'x')).rejects.toMatchObject({
      permanent: true,
    });
  });
});

describe('composing for X', () => {
  it('counts URLs as 23 and wide characters as 2', () => {
    expect(weightedLength('hello')).toBe(5);
    expect(weightedLength('see https://example.com/a/very/long/path/that/goes/on')).toBe(4 + 23);
    expect(weightedLength('日本')).toBe(4);
  });

  it('splits a long text into numbered posts within the limit', () => {
    const text = Array.from(
      { length: 30 },
      (_, i) => `Sentence number ${i} explains one more point.`,
    ).join(' ');
    const posts = splitThread(text);
    expect(posts.length).toBeGreaterThan(1);
    for (const [index, post] of posts.entries()) {
      expect(weightedLength(post)).toBeLessThanOrEqual(280);
      expect(post.endsWith(` ${index + 1}/${posts.length}`)).toBe(true);
    }
    expect(splitThread('Short.')).toEqual(['Short.']);
  });

  it('reports posts over the limit, empty posts and too long threads', () => {
    expect(checkPosts(['x'.repeat(280)]).issues).toEqual([]);
    expect(checkPosts(['x'.repeat(281)]).issues).toEqual([
      'Post 1 is 281 characters; the limit is 280',
    ]);
    expect(checkPosts([' ']).issues).toContain('Post 1 is empty');
    expect(checkPosts(Array.from({ length: 26 }, () => 'a')).issues).toContain(
      'A thread has at most 25 posts',
    );
  });

  it('finds numbers that appear in no source', () => {
    expect(
      unsourcedNumbers(['Revenue grew 40% to 1,200 users 2/3'], ['grew 40% to 1200 users']),
    ).toEqual([]);
    expect(unsourcedNumbers(['Revenue grew 75%'], ['grew 40%'])).toEqual(['75%']);
  });
});

describe('Zernio payloads', () => {
  it('sends a single post with its images and publishNow', () => {
    expect(
      zernioBody({
        posts: ['Hello'],
        images: ['https://api/x.png'],
        accountId: 'acc',
        mode: 'now',
        scheduledFor: null,
        timezone: 'UTC',
      }),
    ).toEqual({
      content: 'Hello',
      mediaItems: [{ type: 'image', url: 'https://api/x.png' }],
      platforms: [{ platform: 'twitter', accountId: 'acc' }],
      publishNow: true,
    });
  });

  it('sends a thread as threadItems at the wall-clock time of its zone', () => {
    const body = zernioBody({
      posts: ['One', 'Two'],
      images: [],
      accountId: 'acc',
      mode: 'schedule',
      scheduledFor: new Date('2026-12-01T09:00:00Z'),
      timezone: 'Europe/Amsterdam',
    });
    expect(body).toMatchObject({
      content: 'One',
      platforms: [
        {
          platform: 'twitter',
          accountId: 'acc',
          platformSpecificData: { threadItems: [{ content: 'One' }, { content: 'Two' }] },
        },
      ],
      scheduledFor: '2026-12-01T10:00:00',
      timezone: 'Europe/Amsterdam',
    });
    expect(body).not.toHaveProperty('publishNow');
  });

  it("reads Zernio's post status and keeps only known fields", () => {
    expect(
      readZernioPost({
        post: {
          _id: 'zp1',
          status: 'published',
          accessToken: 'secret',
          platforms: [
            {
              platform: 'twitter',
              status: 'published',
              platformPostUrl: 'https://twitter.com/a/status/9',
            },
          ],
        },
      }),
    ).toMatchObject({
      kind: 'accepted',
      status: 'published',
      zernioPostId: 'zp1',
      platformPostUrl: 'https://twitter.com/a/status/9',
    });
    expect(
      JSON.stringify(readZernioPost({ post: { _id: 'x', accessToken: 'secret' } })),
    ).not.toContain('secret');
    expect(
      readZernioPost({
        post: { _id: 'x', platforms: [{ status: 'failed', errorMessage: 'Duplicate' }] },
      }),
    ).toMatchObject({
      status: 'failed',
      error: 'Duplicate',
    });
    expect(readZernioPost({})).toBeNull();
  });
});
