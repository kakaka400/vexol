import type { LeadFormat, LeadPlatform, ScrapeRun, ScrapeRunStatus, ScrapedLead } from '@/lib/api';
import { toCsv } from '@/utils/csv';

export const GENERAL_TAB = 'general';
export const NO_SECTOR = 'No sector';
export const ALL_SECTORS = '__all__';

export function formatLeadDate(value: string | null) {
  if (!value) return '—';
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(value),
  );
}

export const LEAD_FORMAT_LABEL: Record<LeadFormat, string> = {
  email: 'Email (company and its email address)',
  social: 'Social (account and its comment)',
};

// The lead columns a table or export shows: one format, or both on the General tab.
export type LeadView = LeadFormat | 'mixed';

export const LEAD_COLUMNS: Record<LeadView, string[]> = {
  email: ['Company', 'Email', 'Added'],
  social: ['Account', 'Followers', 'Comment', 'Commented', 'Video'],
  mixed: ['Lead', 'Contact', 'Platform', 'Added'],
};

export function formatFollowers(value: number | null) {
  if (value == null) return '—';
  return new Intl.NumberFormat(undefined, { notation: 'compact' }).format(value);
}

export const RUN_STATUS_LABEL: Record<ScrapeRunStatus, string> = {
  queued: 'Queued',
  running: 'Running',
  completed: 'Completed',
  failed: 'Failed',
};

export function runStatusVariant(status: ScrapeRunStatus) {
  if (status === 'failed') return 'destructive' as const;
  if (status === 'completed') return 'secondary' as const;
  return 'outline' as const;
}

export function slugify(name: string) {
  return name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function groupBySector(leads: ScrapedLead[]): [string, ScrapedLead[]][] {
  const groups = new Map<string, ScrapedLead[]>();
  for (const lead of leads) {
    const sector = lead.sector ?? NO_SECTOR;
    groups.set(sector, [...(groups.get(sector) ?? []), lead]);
  }
  return [...groups.entries()].sort(([a], [b]) =>
    a === NO_SECTOR ? 1 : b === NO_SECTOR ? -1 : a.localeCompare(b),
  );
}

const SOCIAL_COLUMNS = [
  'handle',
  'profile_url',
  'name',
  'followers',
  'comment',
  'commented_at',
  'video_url',
  'sector',
];

function socialCells(lead: ScrapedLead) {
  return [
    lead.handle,
    lead.profileUrl,
    lead.name,
    lead.followers,
    lead.comment,
    lead.commentedAt,
    lead.videoUrl,
    lead.sector,
  ];
}

// The CSV columns match the API imports, so an exported file can be imported again.
// Email leads use the scraper format email,name,sector. The mixed export of the General
// tab has every column; an import reads only the columns of the target platform's format.
export function leadsCsv(leads: ScrapedLead[], view: LeadView) {
  if (view === 'email') {
    return toCsv(
      ['email', 'name', 'sector'],
      leads.map((lead) => [lead.email, lead.name, lead.sector]),
    );
  }
  if (view === 'social') return toCsv(SOCIAL_COLUMNS, leads.map(socialCells));
  return toCsv(
    ['platform', 'email', ...SOCIAL_COLUMNS],
    leads.map((lead) => [lead.platformSlug, lead.email, ...socialCells(lead)]),
  );
}

export function runsCsv(runs: ScrapeRun[]) {
  return toCsv(
    [
      'created_at',
      'platform',
      'region',
      'niche',
      'scale',
      'keywords',
      'signal',
      'max_leads',
      'notes',
      'status',
      'lead_count',
    ],
    runs.map((run) => [
      run.createdAt,
      run.platformSlug,
      run.region,
      run.niche,
      run.scale,
      run.keywords,
      run.signal,
      run.maxLeads,
      run.notes,
      run.status,
      run.leadCount,
    ]),
  );
}

export function platformsCsv(platforms: LeadPlatform[]) {
  return toCsv(
    ['slug', 'name', 'active', 'lead_format', 'instructions'],
    platforms.map((platform) => [
      platform.slug,
      platform.name,
      platform.active,
      platform.leadFormat,
      platform.instructions,
    ]),
  );
}

export const csvDate = () => new Date().toISOString().slice(0, 10);
