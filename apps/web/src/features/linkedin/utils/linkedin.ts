import type { LinkedinPost } from '@/lib/api';

// Mirror apps/api/src/linkedin/routes.ts.
export const LINKEDIN_MAX_LENGTH = 3000;
export const LINKEDIN_MAX_IMAGES = 9;

export const STATUS_LABEL: Record<LinkedinPost['status'], string> = {
  pending: 'Sending',
  unknown: 'Outcome unknown',
  scheduled: 'Scheduled in Buffer',
  published: 'Published',
  failed: 'Failed',
};

export function splitLines(value: string): string[] {
  return value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
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

// Only https links are rendered.
export function safeHref(url: string | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).protocol === 'https:' ? url : null;
  } catch {
    return null;
  }
}
