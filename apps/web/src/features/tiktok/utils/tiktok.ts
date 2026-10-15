import type { TiktokAnimation, TiktokPost } from '@/lib/api';

// Mirrors apps/api/src/tiktok/routes.ts.
export const TIKTOK_CAPTION_MAX_LENGTH = 2200;
export const MAX_COLORS = 12;

export const EMPTY_ANIMATION: TiktokAnimation = {
  prompt: '',
  colors: [],
  style: '',
  durationSeconds: 15,
};

export const STATUS_LABEL: Record<TiktokPost['status'], string> = {
  pending: 'Sending',
  unknown: 'Outcome unknown',
  scheduled: 'Scheduled in Buffer',
  published: 'Published',
  failed: 'Failed',
};

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

// Only https links are rendered or played.
export function safeHref(url: string | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).protocol === 'https:' ? url : null;
  } catch {
    return null;
  }
}
