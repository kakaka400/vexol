import { Elysia, t } from 'elysia';
import { requireGod } from '../shared/access';
import { authContext } from '../shared/auth-context';
import { ErrorResponse } from '../shared/responses';
import { approve, listDrafts, listPublished, reject } from './framer';

const BlogPostSchema = t.Object({
  id: t.String(),
  slug: t.String(),
  title: t.String(),
  category: t.Nullable(t.String()),
  excerpt: t.Nullable(t.String()),
  publishedAt: t.Nullable(t.String()),
  content: t.Nullable(t.String()),
  isDraft: t.Boolean(),
});

const errors = {
  400: ErrorResponse,
  401: ErrorResponse,
  403: ErrorResponse,
  404: ErrorResponse,
  500: ErrorResponse,
  502: ErrorResponse,
};

export const blogRoutes = new Elysia({ name: 'blog', detail: { tags: ['Blog'] } })
  .use(authContext)
  .onBeforeHandle(({ user }) => {
    requireGod(user);
  })

  .get('/blog/drafts', () => listDrafts(), {
    detail: { summary: 'List draft blog posts pending approval' },
    response: { 200: t.Array(BlogPostSchema), ...errors },
  })

  .get('/blog/published', () => listPublished(), {
    detail: { summary: 'List published blog posts' },
    response: { 200: t.Array(BlogPostSchema), ...errors },
  })

  .post(
    '/blog/drafts/:slug/approve',
    async ({ params: { slug } }) => {
      await approve(slug);
      return { ok: true };
    },
    {
      params: t.Object({ slug: t.String() }),
      detail: { summary: 'Approve a draft post: publish it on Framer' },
      response: { 200: t.Object({ ok: t.Boolean() }), ...errors },
    },
  )

  .post(
    '/blog/drafts/:slug/reject',
    async ({ params: { slug } }) => {
      await reject(slug);
      return { ok: true };
    },
    {
      params: t.Object({ slug: t.String() }),
      detail: { summary: 'Reject a draft post: delete it from Framer' },
      response: { 200: t.Object({ ok: t.Boolean() }), ...errors },
    },
  );
