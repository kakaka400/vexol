import { describe, expect, it } from 'bun:test';
import { normalizeApifyAuthor, normalizeApifyPost, searchQuery } from '../../adapters';
import { contentHash, item, mergeUpdate } from '../../normalize';
import { canonicalPostUrl, normalizeHandle, parseXUrl } from '../../urls';

const fetchedAt = new Date('2026-10-07T12:00:00Z');

describe('X URLs and handles', () => {
  it('reduces every spelling of a post URL to one canonical x.com URL', () => {
    for (const url of [
      'https://twitter.com/Vexol/status/1852634789012345678',
      'https://x.com/vexol/status/1852634789012345678?s=20',
      'http://mobile.twitter.com/VEXOL/status/1852634789012345678/photo/1',
      'https://www.x.com/vexol/status/1852634789012345678#reply',
    ]) {
      expect(canonicalPostUrl(url)).toBe('https://x.com/vexol/status/1852634789012345678');
    }
  });

  it('recognises profile URLs and rejects other X pages', () => {
    expect(parseXUrl('https://x.com/Vexol')).toEqual({ kind: 'profile', handle: 'vexol' });
    expect(() => parseXUrl('https://x.com/search?q=ai')).toThrow('does not name an X account');
    expect(() => parseXUrl('https://x.com/i/status/1')).toThrow();
    expect(() => parseXUrl('https://x.com/vexol/likes')).toThrow('neither a profile nor a post');
  });

  it('accepts only x.com and twitter.com over http(s)', () => {
    expect(() => parseXUrl('https://evil.example/vexol/status/1')).toThrow('Only x.com');
    expect(() => parseXUrl('https://x.com.evil.example/vexol')).toThrow('Only x.com');
    expect(() => parseXUrl('javascript:alert(1)')).toThrow();
    expect(() => parseXUrl('ftp://x.com/vexol')).toThrow('Only http');
    expect(() => parseXUrl('https://user:pw@x.com/vexol')).toThrow('Not an X URL');
    expect(() => parseXUrl('not a url')).toThrow('Not a valid URL');
  });

  it('validates handles', () => {
    expect(normalizeHandle('@Vexol_EU')).toBe('vexol_eu');
    expect(() => normalizeHandle('way_too_long_handle_name')).toThrow();
    expect(() => normalizeHandle('../etc')).toThrow();
    expect(() => normalizeHandle('home')).toThrow();
  });
});

describe('adapter normalization', () => {
  const searchItem = {
    postText: 'AI agents cut support time by 40% #ai',
    postUrl: 'https://x.com/VexolEU/status/111',
    timestamp: Date.parse('2026-10-06T09:30:00.000Z'),
    postId: '111',
    media: [
      { mediaUrlHttps: 'https://pbs.twimg.com/media/a.jpg', type: 'photo', id: 'm1' },
      { mediaUrlHttps: 'javascript:x', type: 'video', id: 'm2' },
    ],
    author: {
      name: 'Vexol',
      screenName: 'VexolEU',
      followersCount: 42,
      description: 'Bio',
    },
    replyCount: 1,
    quoteCount: 0,
    repostCount: 3,
    favouriteCount: 12,
    viewCount: 900,
  };

  it('reads an Apify post with metrics and media', () => {
    const entry = normalizeApifyPost(searchItem, fetchedAt);
    expect(entry).toMatchObject({
      postId: '111',
      canonicalUrl: 'https://x.com/vexoleu/status/111',
      authorHandle: 'vexoleu',
      authorName: 'Vexol',
      profileUrl: 'https://x.com/vexoleu',
      text: 'AI agents cut support time by 40% #ai',
      language: null,
      metrics: {
        like_count: 12,
        retweet_count: 3,
        reply_count: 1,
        quote_count: 0,
        impression_count: 900,
      },
      media: [
        { type: 'photo', url: 'https://pbs.twimg.com/media/a.jpg', altText: null },
        { type: 'video', url: null, altText: null },
      ],
      adapter: 'apify',
      sourceStatus: 'ok',
      verificationStatus: 'unverified',
    });
    expect(entry!.publishedAt?.toISOString()).toBe('2026-10-06T09:30:00.000Z');
  });

  it('reads a reply by its own id and URL', () => {
    const entry = normalizeApifyPost(
      {
        replyId: '555',
        replyUrl: 'https://x.com/someone/status/555',
        replyText: '@VexolEU agreed',
        postId: '111',
        postUrl: 'https://x.com/VexolEU/status/111',
        author: { name: 'Someone', screenName: 'someone' },
        viewsCount: 15,
      },
      fetchedAt,
    );
    expect(entry).toMatchObject({
      postId: '555',
      canonicalUrl: 'https://x.com/someone/status/555',
      text: '@VexolEU agreed',
      metrics: { impression_count: 15 },
    });
  });

  it('skips an item without a post id or text', () => {
    expect(normalizeApifyPost({ postUrl: 'https://x.com/a' }, fetchedAt)).toBeNull();
    expect(normalizeApifyPost({ postId: '1', author: { screenName: 'a' } }, fetchedAt)).toBeNull();
  });

  it('reads the author as a profile', () => {
    expect(normalizeApifyAuthor(searchItem, fetchedAt)).toMatchObject({
      handle: 'vexoleu',
      name: 'Vexol',
      description: 'Bio',
      followers: 42,
      profileUrl: 'https://x.com/vexoleu',
    });
  });

  it('builds the X search query with period and language', () => {
    expect(
      searchQuery({
        handles: ['vexoleu'],
        urls: [],
        terms: ['ai agents'],
        hashtags: ['ai'],
        since: '2026-10-01',
        until: '2026-10-05',
        language: 'en',
        maxResults: 3,
        tags: [],
      }),
    ).toBe(
      '("ai agents" OR #ai) (from:vexoleu) lang:en since:2026-10-01 until:2026-10-06 -filter:retweets',
    );
  });
});

describe('deduplication', () => {
  const base = item({
    postId: '1',
    canonicalUrl: 'https://x.com/a/status/1',
    authorHandle: 'A',
    authorName: null,
    text: 'Hello   world',
    publishedAt: null,
    fetchedAt,
    language: null,
    metrics: { like_count: 1 },
    media: [],
    links: [],
    adapter: 'oembed',
    sourceStatus: 'partial',
    verificationStatus: 'unverified',
  });

  it('hashes the author and the text with whitespace and case collapsed', () => {
    expect(contentHash('A', 'Hello   world')).toBe(contentHash('a', 'hello world'));
    expect(contentHash('a', 'hello world')).not.toBe(contentHash('b', 'hello world'));
  });

  it('updates metrics only from a later reading and fills empty fields', () => {
    const stored = { ...base, media: [] };
    const later = {
      ...base,
      fetchedAt: new Date('2026-10-08T00:00:00Z'),
      metrics: { like_count: 5 },
      authorName: 'A Name',
    };
    expect(mergeUpdate(stored, later)).toMatchObject({
      metrics: { like_count: 5 },
      authorName: 'A Name',
    });

    const earlier = {
      ...base,
      fetchedAt: new Date('2026-10-01T00:00:00Z'),
      metrics: { like_count: 99 },
    };
    expect(mergeUpdate(stored, earlier)).toBeNull();
  });

  it('replaces a truncated text by the complete one, never by something else', () => {
    const stored = { ...base, text: 'Hello…', media: [] };
    expect(mergeUpdate(stored, { ...base, text: 'Hello world, complete' })).toMatchObject({
      text: 'Hello world, complete',
    });
    expect(mergeUpdate(stored, { ...base, text: 'Different text entirely' })).toBeNull();
  });
});
