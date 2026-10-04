// Display names for the platform ids Zernio uses.
const LABELS: Record<string, string> = {
  instagram: 'Instagram',
  facebook: 'Facebook',
  linkedin: 'LinkedIn',
  twitter: 'X',
  threads: 'Threads',
  tiktok: 'TikTok',
  youtube: 'YouTube',
  pinterest: 'Pinterest',
  bluesky: 'Bluesky',
  googlebusiness: 'Google Business',
};

export function platformLabel(platform: string): string {
  return LABELS[platform] ?? platform.charAt(0).toUpperCase() + platform.slice(1);
}

const FORMATS: Record<string, string> = { story: 'story', reel: 'reel' };

// "Instagram (story)", "LinkedIn": a schedule target as one short phrase.
export function targetLabel(target: { platform: string; format: string }): string {
  const format = FORMATS[target.format];
  return format ? `${platformLabel(target.platform)} (${format})` : platformLabel(target.platform);
}

// A schedule is entered in the browser's own time zone, which is sent with it.
export const SCHEDULE_TIME_ZONE = Intl.DateTimeFormat().resolvedOptions().timeZone;
