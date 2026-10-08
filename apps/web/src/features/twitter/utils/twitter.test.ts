import { describe, expect, it } from 'bun:test';
import {
  EMPTY_RESEARCH_FORM,
  obsidianLink,
  researchMode,
  researchRequest,
  safeHref,
  storageLabel,
  weightedLength,
  zonedTimeToUtc,
} from './twitter';

describe('research form', () => {
  it('turns the fields into a request, leaving out what is empty', () => {
    expect(
      researchRequest({
        ...EMPTY_RESEARCH_FORM,
        question: ' What do founders say? ',
        handles: '@a, b\n c',
        terms: 'ai agents',
        maxResults: '20',
        language: 'EN',
        tags: 'launch,',
      }),
    ).toEqual({
      question: 'What do founders say?',
      handles: ['@a', 'b', 'c'],
      urls: [],
      terms: ['ai agents'],
      hashtags: [],
      language: 'en',
      maxResults: 20,
      tags: ['launch'],
    });
  });

  it('reads post URLs directly and queues everything else', () => {
    expect(
      researchMode(
        researchRequest({ ...EMPTY_RESEARCH_FORM, postUrls: 'https://x.com/a/status/1' }),
      ),
    ).toBe('post');
    expect(
      researchMode(researchRequest({ ...EMPTY_RESEARCH_FORM, profileUrl: 'https://x.com/a' })),
    ).toBe('runs');
    expect(
      researchMode(
        researchRequest({
          ...EMPTY_RESEARCH_FORM,
          terms: 'ai',
          postUrls: 'https://x.com/a/status/1',
        }),
      ),
    ).toBe('runs');
  });
});

describe('display helpers', () => {
  it('says a run is saved only when every note is written', () => {
    const storage = { notes: 3, written: 3, pending: 0, failed: 0, complete: true };
    expect(storageLabel({ status: 'completed', storage })).toBe('Saved to Obsidian (3 notes)');
    expect(
      storageLabel({
        status: 'completed',
        storage: { ...storage, written: 1, pending: 2, complete: false },
      }),
    ).toBe('Saving to Obsidian (1 of 3)');
    expect(
      storageLabel({ status: 'completed', storage: { ...storage, failed: 1, complete: false } }),
    ).toBe('1 notes not saved');
  });

  it('links to Obsidian only with a vault name and a note', () => {
    expect(obsidianLink('Vault', 'Socials/Twitter/Posts/1.md')).toBe(
      'obsidian://open?vault=Vault&file=Socials%2FTwitter%2FPosts%2F1',
    );
    expect(obsidianLink(null, 'x.md')).toBeNull();
    expect(obsidianLink('Vault', null)).toBeNull();
  });

  it('renders only http(s) links', () => {
    expect(safeHref('https://x.com/a')).toBe('https://x.com/a');
    expect(safeHref('javascript:alert(1)')).toBeNull();
    expect(safeHref('data:text/html,x')).toBeNull();
  });

  it('counts characters the way X does', () => {
    expect(weightedLength('abc https://example.com/very/long/path')).toBe(4 + 23);
    expect(weightedLength('日本')).toBe(4);
  });

  it('converts a wall-clock time in a zone to UTC', () => {
    expect(zonedTimeToUtc('2026-12-01T10:00', 'Europe/Amsterdam').toISOString()).toBe(
      '2026-12-01T09:00:00.000Z',
    );
    expect(zonedTimeToUtc('2026-07-01T10:00', 'Europe/Amsterdam').toISOString()).toBe(
      '2026-07-01T08:00:00.000Z',
    );
    expect(zonedTimeToUtc('2026-07-01T10:00', 'UTC').toISOString()).toBe(
      '2026-07-01T10:00:00.000Z',
    );
  });
});
