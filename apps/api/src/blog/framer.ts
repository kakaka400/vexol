import { HttpError } from '../shared/lib';

const COLLECTION_ID = 'o2atDU2qU';
const BASE = 'https://api.framer.com/store/api/v2';

export interface BlogPost {
  id: string;
  slug: string;
  title: string;
  category: string | null;
  excerpt: string | null;
  publishedAt: string | null;
  content: string | null;
  isDraft: boolean;
}

function apiKey(): string {
  const key = process.env.FRAMER_API_KEY;
  if (!key) throw new HttpError(500, 'FRAMER_API_KEY is not configured');
  return key;
}

function siteId(): string {
  const id = process.env.FRAMER_SITE_ID;
  if (!id) throw new HttpError(500, 'FRAMER_SITE_ID is not configured');
  return id;
}

async function framerFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiKey()}`,
      'Content-Type': 'application/json',
      ...init.headers,
    },
  });
  return res;
}

function presentItem(item: Record<string, unknown>): BlogPost {
  const f = (item.fieldData ?? item) as Record<string, unknown>;
  return {
    id: String(item.id ?? ''),
    slug: String(f.slug ?? ''),
    title: String(f.title ?? ''),
    category: f.category != null ? String(f.category) : null,
    excerpt: f.excerpt != null ? String(f.excerpt) : null,
    publishedAt: f['published-at'] != null ? String(f['published-at']) : null,
    content: f.content != null ? String(f.content) : null,
    isDraft: f['is-draft'] === true || f.isDraft === true,
  };
}

async function listAll(): Promise<BlogPost[]> {
  const res = await framerFetch(`/collections/${COLLECTION_ID}/items`);
  if (!res.ok) throw new HttpError(502, `Framer list failed: ${res.status}`);
  const data = (await res.json()) as { items?: unknown[] };
  const items = data.items ?? (Array.isArray(data) ? (data as unknown[]) : []);
  return (items as Record<string, unknown>[]).map(presentItem);
}

async function findBySlug(slug: string): Promise<BlogPost> {
  const all = await listAll();
  const post = all.find((p) => p.slug === slug);
  if (!post) throw new HttpError(404, `Blog post '${slug}' not found`);
  return post;
}

export async function listDrafts(): Promise<BlogPost[]> {
  const all = await listAll();
  return all.filter((p) => p.isDraft);
}

export async function listPublished(): Promise<BlogPost[]> {
  const all = await listAll();
  return all.filter((p) => !p.isDraft);
}

export async function approve(slug: string): Promise<void> {
  const post = await findBySlug(slug);
  const patchRes = await framerFetch(`/collections/${COLLECTION_ID}/items/${post.id}`, {
    method: 'PATCH',
    body: JSON.stringify({ fieldData: { 'is-draft': false } }),
  });
  if (!patchRes.ok) throw new HttpError(502, `Framer patch failed: ${patchRes.status}`);
  const publishRes = await framerFetch(`/sites/${siteId()}/publish`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
  if (!publishRes.ok) throw new HttpError(502, `Framer publish failed: ${publishRes.status}`);
}

export async function reject(slug: string): Promise<void> {
  const post = await findBySlug(slug);
  const res = await framerFetch(`/collections/${COLLECTION_ID}/items/${post.id}`, {
    method: 'DELETE',
  });
  if (!res.ok && res.status !== 404)
    throw new HttpError(502, `Framer delete failed: ${res.status}`);
}
