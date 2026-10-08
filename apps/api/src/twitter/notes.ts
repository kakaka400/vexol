import { safeSegment, TWITTER_FOLDER } from './vault';

// The Markdown of every Twitter note and the path it is written to. Post text is
// public data written by strangers: it goes into a quote block with HTML escaped,
// and into frontmatter only as a JSON-quoted string, so it cannot add keys,
// close the frontmatter, or render markup.

export interface ItemNoteInput {
  id: string;
  postId: string | null;
  canonicalUrl: string;
  contentHash: string;
  authorHandle: string;
  authorName: string | null;
  profileUrl: string;
  text: string;
  publishedAt: string | null;
  fetchedAt: string;
  language: string | null;
  metrics: Record<string, number> | null;
  media: Array<Record<string, unknown>>;
  links: string[];
  query: string | null;
  relevance: string | null;
  adapter: string;
  verificationStatus: string;
  sourceStatus: string;
  warnings: string[];
  tags: string[];
  run: { id: string; notePath: string; label: string } | null;
  drafts: Array<{ notePath: string; label: string }>;
}

export interface RunNoteInput {
  id: string;
  kind: string;
  status: string;
  correlationId: string;
  input: Record<string, unknown>;
  adapters: string[];
  warnings: string[];
  stopReason: string | null;
  lastError: string | null;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  items: Array<{ notePath: string; authorHandle: string; text: string }>;
}

export interface DraftNoteInput {
  id: string;
  status: string;
  currentVersion: number;
  posts: string[];
  tone: string | null;
  createdAt: string;
  updatedAt: string;
  sources: Array<{ notePath: string; authorHandle: string; canonicalUrl: string }>;
  publications: Array<{ notePath: string; status: string }>;
}

export interface PublishedNoteInput {
  id: string;
  draftId: string;
  version: number;
  mode: string;
  status: string;
  accountHandle: string | null;
  bufferPostId: string | null;
  platformPostUrl: string | null;
  scheduledFor: string | null;
  timezone: string;
  confirmedByName: string | null;
  confirmedAt: string;
  correlationId: string;
  posts: string[];
  draftNotePath: string;
}

export const queryLabel = (input: Record<string, unknown>): string => {
  const parts = [
    input.question,
    ...(Array.isArray(input.terms) ? input.terms : []),
    ...(Array.isArray(input.hashtags) ? input.hashtags.map((tag) => `#${tag}`) : []),
    ...(Array.isArray(input.handles) ? input.handles.map((handle) => `@${handle}`) : []),
    ...(Array.isArray(input.urls) ? input.urls : []),
  ].filter((part): part is string => typeof part === 'string' && part.length > 0);
  return (parts.join(' ') || 'research').slice(0, 300);
};

export const itemNotePath = (item: { postId: string | null; contentHash: string }) =>
  `${TWITTER_FOLDER}/Posts/${safeSegment(item.postId ?? item.contentHash.slice(0, 24))}.md`;

export const profileNotePath = (handle: string) =>
  `${TWITTER_FOLDER}/Profiles/${safeSegment(handle)}.md`;

export const draftNotePath = (draftId: string) =>
  `${TWITTER_FOLDER}/Drafts/${safeSegment(draftId)}.md`;

export const publishedNotePath = (job: { id: string; bufferPostId: string | null }) =>
  `${TWITTER_FOLDER}/Published/${safeSegment(job.bufferPostId ?? job.id)}.md`;

export const DASHBOARD_NOTE_PATH = `${TWITTER_FOLDER}/Dashboard.md`;

export function runNotePath(run: {
  id: string;
  createdAt: string;
  input: Record<string, unknown>;
}) {
  const day = run.createdAt.slice(0, 10);
  const slug = safeSegment(
    queryLabel(run.input)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-'),
    50,
  );
  return `${TWITTER_FOLDER}/Research Runs/${day.slice(0, 4)}/${day.slice(5, 7)}/${day}--${slug}--${run.id.slice(0, 8)}.md`;
}

export function wikiLink(notePath: string, label: string): string {
  const cleanLabel = label
    .replace(/[[\]|\n\r]/g, ' ')
    .slice(0, 80)
    .trim();
  return `[[${notePath.replace(/\.md$/, '')}|${cleanLabel || 'note'}]]`;
}

const yaml = (value: unknown): string => (value == null ? 'null' : JSON.stringify(value));

function frontmatter(fields: Record<string, unknown>): string[] {
  const lines = ['---'];
  for (const [key, value] of Object.entries(fields)) {
    if (Array.isArray(value)) {
      if (value.length === 0) lines.push(`${key}: []`);
      else {
        lines.push(`${key}:`);
        for (const entry of value) lines.push(`  - ${yaml(entry)}`);
      }
    } else {
      lines.push(`${key}: ${yaml(value)}`);
    }
  }
  lines.push('---', '');
  return lines;
}

function escapeMarkup(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function quote(text: string): string[] {
  return escapeMarkup(text)
    .split('\n')
    .map((line) => `> ${line}`);
}

const oneLine = (text: string, max = 100) => {
  const line = escapeMarkup(text.replace(/\s+/g, ' ').trim());
  return line.length > max ? `${line.slice(0, max - 1)}…` : line;
};

export function renderItemNote(item: ItemNoteInput): string {
  const lines = frontmatter({
    type: 'twitter-research',
    platform: 'x',
    post_id: item.postId,
    canonical_url: item.canonicalUrl,
    author_handle: item.authorHandle,
    author_name: item.authorName,
    published_at: item.publishedAt,
    fetched_at: item.fetchedAt,
    language: item.language,
    research_run_id: item.run?.id ?? null,
    query: item.query,
    verification_status: item.verificationStatus,
    source_status: item.sourceStatus,
    content_hash: item.contentHash,
    tags: item.tags,
  });
  lines.push(`# @${item.authorHandle}${item.postId ? ` · ${item.postId}` : ''}`, '');
  lines.push('## Text', '', ...quote(item.text), '');

  lines.push('## Facts from the source', '');
  lines.push(
    `- Author: @${item.authorHandle}${item.authorName ? ` (${oneLine(item.authorName, 60)})` : ''}`,
  );
  lines.push(`- Published: ${item.publishedAt ?? 'not returned by the source'}`);
  lines.push(`- Fetched: ${item.fetchedAt} via ${item.adapter}`);
  lines.push(`- Language: ${item.language ?? 'unknown'}`);
  if (item.metrics && Object.keys(item.metrics).length > 0) {
    const metrics = Object.entries(item.metrics)
      .map(([key, value]) => `${key.replace(/_/g, ' ')} ${value}`)
      .join(', ');
    lines.push(`- Visible metrics at fetch time: ${metrics}`);
  } else {
    lines.push('- Visible metrics: not available from this source');
  }
  lines.push('');

  if (item.media.length > 0 || item.links.length > 0) {
    lines.push('## Media and links', '');
    for (const media of item.media) {
      const type = typeof media.type === 'string' ? media.type : 'media';
      const url = typeof media.url === 'string' ? media.url : null;
      const alt = typeof media.altText === 'string' ? ` — alt: ${oneLine(media.altText, 120)}` : '';
      lines.push(`- ${type}${url ? `: <${url}>` : ''}${alt}`);
    }
    for (const link of item.links) lines.push(`- link: <${link}>`);
    lines.push('');
  }

  lines.push('## Why it is relevant (inference, not a fact from the source)', '');
  lines.push(item.relevance ? oneLine(item.relevance, 1000) : '_No relevance note yet._', '');

  if (item.warnings.length > 0) {
    lines.push(
      '## Warnings',
      '',
      ...item.warnings.map((warning) => `- ${oneLine(warning, 300)}`),
      '',
    );
  }

  if (item.drafts.length > 0) {
    lines.push(
      '## Used in drafts',
      '',
      ...item.drafts.map((d) => `- ${wikiLink(d.notePath, d.label)}`),
      '',
    );
  }

  lines.push('## Links', '');
  if (item.run) lines.push(`- Research run: ${wikiLink(item.run.notePath, item.run.label)}`);
  lines.push(`- Profile: ${wikiLink(profileNotePath(item.authorHandle), `@${item.authorHandle}`)}`);
  lines.push(`- Source: <${item.canonicalUrl}>`, '');
  return lines.join('\n');
}

export function renderProfileNote(profile: {
  handle: string;
  name: string | null;
  description: string | null;
  followers: number | null;
  profileUrl: string;
  fetchedAt: string;
  posts: Array<{ notePath: string; text: string }>;
}): string {
  const lines = frontmatter({
    type: 'twitter-profile',
    platform: 'x',
    handle: profile.handle,
    name: profile.name,
    profile_url: profile.profileUrl,
    followers: profile.followers,
    fetched_at: profile.fetchedAt,
  });
  lines.push(`# @${profile.handle}`, '');
  if (profile.description) lines.push(...quote(profile.description), '');
  lines.push(`- Profile: <${profile.profileUrl}>`);
  if (profile.followers != null) lines.push(`- Followers at fetch time: ${profile.followers}`);
  lines.push('', '## Posts in the library', '');
  if (profile.posts.length === 0) lines.push('_None yet._');
  for (const post of profile.posts)
    lines.push(`- ${wikiLink(post.notePath, oneLine(post.text, 70))}`);
  lines.push('');
  return lines.join('\n');
}

export function renderRunNote(run: RunNoteInput): string {
  const label = queryLabel(run.input);
  const lines = frontmatter({
    type: 'twitter-research-run',
    platform: 'x',
    research_run_id: run.id,
    correlation_id: run.correlationId,
    kind: run.kind,
    status: run.status,
    query: label,
    created_at: run.createdAt,
    started_at: run.startedAt,
    finished_at: run.finishedAt,
    adapters: run.adapters,
    result_count: run.items.length,
    tags: Array.isArray(run.input.tags) ? run.input.tags : [],
  });
  lines.push(`# Research: ${oneLine(label, 120)}`, '');
  lines.push('## Request', '');
  for (const [key, value] of Object.entries(run.input)) {
    if (value == null || (Array.isArray(value) && value.length === 0) || value === '') continue;
    const text = Array.isArray(value) ? value.join(', ') : String(value);
    lines.push(`- ${key}: ${oneLine(text, 300)}`);
  }
  lines.push('');
  if (run.stopReason) lines.push(`**Stopped:** ${oneLine(run.stopReason, 300)}`, '');
  if (run.lastError) lines.push(`**Error:** ${oneLine(run.lastError, 300)}`, '');
  if (run.warnings.length > 0) {
    lines.push('## Warnings', '', ...run.warnings.map((w) => `- ${oneLine(w, 300)}`), '');
  }
  lines.push(`## Results (${run.items.length})`, '');
  if (run.items.length === 0) lines.push('_No posts found._');
  for (const item of run.items) {
    lines.push(`- ${wikiLink(item.notePath, `@${item.authorHandle}: ${item.text.slice(0, 60)}`)}`);
  }
  lines.push('', `Back to ${wikiLink(DASHBOARD_NOTE_PATH, 'Twitter dashboard')}`, '');
  return lines.join('\n');
}

export function renderDraftNote(draft: DraftNoteInput): string {
  const lines = frontmatter({
    type: 'twitter-draft',
    platform: 'x',
    draft_id: draft.id,
    status: draft.status,
    version: draft.currentVersion,
    kind: draft.posts.length > 1 ? 'thread' : 'single',
    tone: draft.tone,
    created_at: draft.createdAt,
    updated_at: draft.updatedAt,
  });
  lines.push(`# Draft ${draft.id.slice(0, 8)} (v${draft.currentVersion})`, '');
  draft.posts.forEach((post, index) => {
    lines.push(
      `### ${draft.posts.length > 1 ? `Post ${index + 1}` : 'Post'}`,
      '',
      ...quote(post),
      '',
    );
  });
  lines.push('## Sources', '');
  if (draft.sources.length === 0) lines.push('_No research items linked._');
  for (const source of draft.sources) {
    lines.push(
      `- ${wikiLink(source.notePath, `@${source.authorHandle}`)} — <${source.canonicalUrl}>`,
    );
  }
  if (draft.publications.length > 0) {
    lines.push('', '## Publications', '');
    for (const pub of draft.publications) lines.push(`- ${wikiLink(pub.notePath, pub.status)}`);
  }
  lines.push('');
  return lines.join('\n');
}

export function renderPublishedNote(job: PublishedNoteInput): string {
  const lines = frontmatter({
    type: 'twitter-publication',
    platform: 'x',
    publish_job_id: job.id,
    draft_id: job.draftId,
    version: job.version,
    mode: job.mode,
    status: job.status,
    account: job.accountHandle,
    buffer_post_id: job.bufferPostId,
    platform_post_url: job.platformPostUrl,
    scheduled_for: job.scheduledFor,
    timezone: job.timezone,
    confirmed_by: job.confirmedByName,
    confirmed_at: job.confirmedAt,
    correlation_id: job.correlationId,
  });
  lines.push(`# Publication ${job.bufferPostId ?? job.id.slice(0, 8)}`, '');
  job.posts.forEach((post) => lines.push(...quote(post), ''));
  lines.push(`- Draft: ${wikiLink(job.draftNotePath, `draft v${job.version}`)}`);
  if (job.platformPostUrl) lines.push(`- On X: <${job.platformPostUrl}>`);
  lines.push('');
  return lines.join('\n');
}

export function renderDashboardNote(dashboard: {
  generatedAt: string;
  runs: Array<{
    notePath: string;
    label: string;
    status: string;
    createdAt: string;
    found: number;
  }>;
  itemCount: number;
  draftCount: number;
  publishedCount: number;
}): string {
  const lines = frontmatter({
    type: 'twitter-dashboard',
    platform: 'x',
    updated_at: dashboard.generatedAt,
  });
  lines.push('# Twitter research', '');
  lines.push(`- Posts in the library: ${dashboard.itemCount}`);
  lines.push(`- Drafts: ${dashboard.draftCount}`);
  lines.push(`- Publications: ${dashboard.publishedCount}`, '');
  lines.push('## Recent research runs', '');
  if (dashboard.runs.length === 0) lines.push('_None yet._');
  for (const run of dashboard.runs) {
    lines.push(
      `- ${run.createdAt.slice(0, 10)} · ${wikiLink(run.notePath, run.label)} · ${run.status} · ${run.found} posts`,
    );
  }
  lines.push('');
  return lines.join('\n');
}
