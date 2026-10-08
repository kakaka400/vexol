import type { TwitterResearchInput, TwitterRun } from '@/lib/api';

export const TWITTER_MAX_LENGTH = 280;
export const SCHEDULE_TIME_ZONE = Intl.DateTimeFormat().resolvedOptions().timeZone;

// Splits a comma or newline separated field into its entries.
export function splitList(value: string): string[] {
  return value
    .split(/[\n,]/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export interface ResearchFormValues {
  question: string;
  handles: string;
  profileUrl: string;
  postUrls: string;
  terms: string;
  hashtags: string;
  since: string;
  until: string;
  language: string;
  maxResults: string;
  tags: string;
  context: string;
}

export const EMPTY_RESEARCH_FORM: ResearchFormValues = {
  question: '',
  handles: '',
  profileUrl: '',
  postUrls: '',
  terms: '',
  hashtags: '',
  since: '',
  until: '',
  language: '',
  maxResults: '',
  tags: '',
  context: '',
};

export function researchRequest(values: ResearchFormValues): TwitterResearchInput {
  const urls = [...splitList(values.profileUrl), ...splitList(values.postUrls)];
  const max = Number(values.maxResults);
  return {
    ...(values.question.trim() ? { question: values.question.trim() } : {}),
    handles: splitList(values.handles),
    urls,
    terms: splitList(values.terms),
    hashtags: splitList(values.hashtags),
    ...(values.since ? { since: values.since } : {}),
    ...(values.until ? { until: values.until } : {}),
    ...(values.language.trim() ? { language: values.language.trim().toLowerCase() } : {}),
    ...(Number.isInteger(max) && max > 0 ? { maxResults: max } : {}),
    tags: splitList(values.tags),
    ...(values.context.trim() ? { context: values.context.trim() } : {}),
  };
}

// Post URLs only go to the direct post lookup, which works without an X API token.
export function researchMode(request: TwitterResearchInput): 'runs' | 'post' {
  const onlyPosts =
    !request.question &&
    (request.handles ?? []).length === 0 &&
    (request.terms ?? []).length === 0 &&
    (request.hashtags ?? []).length === 0 &&
    (request.urls ?? []).length > 0 &&
    (request.urls ?? []).every((url) => /\/status\/\d+/.test(url));
  return onlyPosts ? 'post' : 'runs';
}

export function runLabel(run: Pick<TwitterRun, 'input'>): string {
  const input = run.input;
  const parts = [
    input.question,
    ...(input.terms ?? []),
    ...(input.hashtags ?? []).map((tag) => `#${tag}`),
    ...(input.handles ?? []).map((handle) => `@${handle}`),
    ...(input.urls ?? []),
  ].filter(Boolean);
  return parts.join(' · ') || 'Research';
}

export const RUN_STATUS_LABEL: Record<TwitterRun['status'], string> = {
  queued: 'Queued',
  running: 'Running',
  completed: 'Completed',
  partial: 'Partial',
  stopped: 'Stopped',
  failed: 'Failed',
};

export function storageLabel(run: Pick<TwitterRun, 'status' | 'storage'>): string {
  const { storage } = run;
  if (storage.complete) return `Saved to Obsidian (${storage.written} notes)`;
  if (storage.failed > 0) return `${storage.failed} notes not saved`;
  if (run.status === 'queued' || run.status === 'running') return 'Not saved yet';
  return `Saving to Obsidian (${storage.written} of ${storage.notes})`;
}

export function formatDate(value: string | null): string {
  if (!value) return '—';
  return new Intl.DateTimeFormat('en', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

export function metricLabel(key: string): string {
  return key.replace(/_count$/, '').replace(/_/g, ' ');
}

// An obsidian:// link to a note, when the vault name is known.
export function obsidianLink(vaultName: string | null, notePath: string | null): string | null {
  if (!vaultName || !notePath) return null;
  return `obsidian://open?vault=${encodeURIComponent(vaultName)}&file=${encodeURIComponent(notePath.replace(/\.md$/, ''))}`;
}

// The X weighted length, as the API counts it: URLs as 23, wide characters as 2.
export function weightedLength(text: string): number {
  let length = 0;
  const rest = text.normalize('NFC').replace(/https?:\/\/[^\s]+/g, () => {
    length += 23;
    return '';
  });
  for (const char of rest) {
    const code = char.codePointAt(0)!;
    const narrow =
      code <= 4351 ||
      (code >= 8192 && code <= 8205) ||
      (code >= 8208 && code <= 8223) ||
      (code >= 8242 && code <= 8247);
    length += narrow ? 1 : 2;
  }
  return length;
}

// A safe href: only http(s) URLs are rendered as links.
export function safeHref(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? parsed.toString() : null;
  } catch {
    return null;
  }
}

// The UTC instant of a wall-clock time ("2026-12-01T10:00") in a time zone.
export function zonedTimeToUtc(local: string, timeZone: string): Date {
  const [date, time = '00:00'] = local.split('T');
  const [year, month, day] = date!.split('-').map(Number);
  const [hour, minute] = time.split(':').map(Number);
  const guess = Date.UTC(year!, month! - 1, day!, hour!, minute!);
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
    })
      .formatToParts(new Date(guess))
      .map((part) => [part.type, Number(part.value)]),
  );
  const asZone = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute);
  return new Date(guess - (asZone - guess));
}
