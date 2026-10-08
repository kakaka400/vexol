// Turns submitted rows (CSV records or JSON objects from an agent) into leads, following
// the rules of the platform's lead format. Invalid rows are skipped and counted.

export type LeadFormat = 'email' | 'social';

export interface LeadInput {
  email: string | null;
  name: string;
  sector: string | null;
  handle: string | null;
  profileUrl: string | null;
  followers: number | null;
  comment: string | null;
  commentedAt: string | null;
  videoUrl: string | null;
}

// A CSV record uses snake_case headers, a JSON lead camelCase keys; both are read.
type RawLead = Record<string, unknown>;

function field(record: RawLead, ...keys: string[]): string {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  }
  return '';
}

const EMAIL = /^[^@\s,]+@[^@\s,]+\.[a-z]{2,}$/;

export function normalizeEmail(value: string): string | null {
  const email = value
    .trim()
    .toLowerCase()
    .replace(/^mailto:/, '')
    .replace(/^[<(]+|[>)]+$/g, '');
  return EMAIL.test(email) ? email : null;
}

function httpUrl(value: string): string | null {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : null;
  } catch {
    return null;
  }
}

// The handle as given, or the last path segment of the profile link
// (https://www.tiktok.com/@janedoe → janedoe).
function normalizeHandle(handle: string, profileUrl: string | null): string | null {
  let value = handle;
  if (!value && profileUrl) {
    const segments = new URL(profileUrl).pathname.split('/').filter(Boolean);
    value = segments.at(-1) ?? '';
  }
  value = value.replace(/^@/, '').toLowerCase();
  return /^[\w.-]{1,100}$/.test(value) ? value : null;
}

// Reads 1234, "1,234", "12.5k" and "1.2M".
export function parseCount(value: string): number | null {
  const match = value
    .replace(/[,\s]/g, '')
    .toLowerCase()
    .match(/^(\d+(?:\.\d+)?)([km]?)$/);
  if (!match) return null;
  const multiplier = match[2] === 'k' ? 1_000 : match[2] === 'm' ? 1_000_000 : 1;
  return Math.round(Number(match[1]) * multiplier);
}

function parseDate(value: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  return isNaN(date.getTime()) ? null : date.toISOString();
}

const EMPTY_SOCIAL = {
  handle: null,
  profileUrl: null,
  followers: null,
  comment: null,
  commentedAt: null,
  videoUrl: null,
};

function emailLead(record: RawLead): { key: string; lead: LeadInput } | null {
  const email = normalizeEmail(field(record, 'email'));
  const name = field(record, 'name');
  if (!email || !name) return null;
  return {
    key: email,
    lead: { email, name, sector: field(record, 'sector') || null, ...EMPTY_SOCIAL },
  };
}

function socialLead(record: RawLead): { key: string; lead: LeadInput } | null {
  const profileUrl = httpUrl(field(record, 'profileUrl', 'profile_url'));
  const handle = normalizeHandle(field(record, 'handle'), profileUrl);
  if (!handle) return null;
  return {
    key: handle,
    lead: {
      email: null,
      name: field(record, 'name') || handle,
      sector: field(record, 'sector') || null,
      handle,
      profileUrl,
      followers: parseCount(field(record, 'followers')),
      comment: field(record, 'comment').slice(0, 2000) || null,
      commentedAt: parseDate(field(record, 'commentedAt', 'commented_at')),
      videoUrl: httpUrl(field(record, 'videoUrl', 'video_url')),
    },
  };
}

// An email lead needs a valid email and a name; a social lead needs a handle or a
// profile link. A repeated email or handle keeps the first row.
export function toLeadInputs(
  format: LeadFormat,
  records: RawLead[],
): { leads: LeadInput[]; skipped: number } {
  const read = format === 'email' ? emailLead : socialLead;
  const seen = new Set<string>();
  const leads: LeadInput[] = [];
  let skipped = 0;
  for (const record of records) {
    const result = read(record);
    if (!result || seen.has(result.key)) {
      skipped++;
      continue;
    }
    seen.add(result.key);
    leads.push(result.lead);
  }
  return { leads, skipped };
}
