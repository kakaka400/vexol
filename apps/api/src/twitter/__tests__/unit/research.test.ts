import { describe, expect, it } from 'bun:test';
import { normalizeOembed, normalizeXApiTweets, normalizeXApiUser } from '../../adapters';
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
  const xApiPayload = {
    data: [
      {
        id: '111',
        text: 'Short version…',
        note_tweet: { text: 'The full long text of the post' },
        created_at: '2026-10-06T09:30:00.000Z',
        lang: 'en',
        author_id: 'u1',
        public_metrics: { like_count: 12, retweet_count: 3, reply_count: 1, quote_count: 0 },
        entities: {
          urls: [{ expanded_url: 'https://example.com/a' }, { expanded_url: 'javascript:x' }],
        },
        attachments: { media_keys: ['m1'] },
      },
      { id: '222', text: 'No author in includes', author_id: 'missing' },
    ],
    includes: {
      users: [{ id: 'u1', username: 'VexolEU', name: 'Vexol' }],
      media: [
        {
          media_key: 'm1',
          type: 'photo',
          url: 'https://pbs.twimg.com/media/a.jpg',
          alt_text: 'A chart',
        },
      ],
    },
  };

  it('reads the X API v2 shape with metrics, media, links and the long text', () => {
    const [entry, ...rest] = normalizeXApiTweets(xApiPayload, fetchedAt);
    expect(rest).toHaveLength(0);
    expect(entry).toMatchObject({
      postId: '111',
      canonicalUrl: 'https://x.com/vexoleu/status/111',
      authorHandle: 'vexoleu',
      authorName: 'Vexol',
      profileUrl: 'https://x.com/vexoleu',
      text: 'The full long text of the post',
      language: 'en',
      metrics: { like_count: 12, retweet_count: 3, reply_count: 1, quote_count: 0 },
      media: [{ type: 'photo', url: 'https://pbs.twimg.com/media/a.jpg', altText: 'A chart' }],
      links: ['https://example.com/a'],
      adapter: 'x_api',
      sourceStatus: 'ok',
      verificationStatus: 'unverified',
    });
    expect(entry!.publishedAt?.toISOString()).toBe('2026-10-06T09:30:00.000Z');
  });

  it('reads an oEmbed answer into the same shape, without metrics', () => {
    const entry = normalizeOembed(
      {
        author_name: 'Vexol',
        author_url: 'https://twitter.com/VexolEU',
        html: '<blockquote class="twitter-tweet"><p lang="nl" dir="ltr">Nieuwe &amp; betere <a href="https://t.co/x">release</a><br>regel twee</p>&mdash; Vexol (@VexolEU) <a href="https://twitter.com/VexolEU/status/333?ref_src=twsrc%5Etfw">October 1, 2026</a></blockquote>',
      },
      { handle: 'vexoleu', postId: '333' },
      fetchedAt,
    );
    expect(entry).toMatchObject({
      postId: '333',
      canonicalUrl: 'https://x.com/vexoleu/status/333',
      authorHandle: 'vexoleu',
      authorName: 'Vexol',
      text: 'Nieuwe & betere release\nregel twee',
      language: 'nl',
      metrics: null,
      adapter: 'oembed',
      sourceStatus: 'partial',
    });
    expect(entry!.publishedAt?.toISOString().slice(0, 10)).toBe('2026-10-01');
  });

  it('returns nothing for an oEmbed answer without a post', () => {
    expect(
      normalizeOembed({ html: '<div></div>' }, { handle: 'a', postId: '1' }, fetchedAt),
    ).toBeNull();
  });

  it('reads an X API user', () => {
    expect(
      normalizeXApiUser(
        {
          data: {
            id: '9',
            username: 'VexolEU',
            name: 'Vexol',
            description: 'Bio',
            public_metrics: { followers_count: 42 },
          },
        },
        fetchedAt,
      ),
    ).toMatchObject({
      handle: 'vexoleu',
      name: 'Vexol',
      followers: 42,
      profileUrl: 'https://x.com/vexoleu',
    });
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
