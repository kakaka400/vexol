import { Elysia, t } from 'elysia';
import { sweepTwitter } from './research';

// The worker calls this on its own schedule to run queued research and write the
// pending Obsidian notes. Research needs the project's decrypted X API token, so
// the work runs in the API (the same split as /internal/competitors/sweep).
export const internalTwitterRoutes = new Elysia({ name: 'internal-twitter' }).post(
  '/internal/twitter/sweep',
  async ({ body, headers, set }) => {
    const expected = process.env.WORKER_INTERNAL_TOKEN;
    if (!expected || headers['x-worker-token'] !== expected) {
      set.status = 401;
      return { runs: 0, written: 0, retry: 0, failed: 0, error: 'Unauthorized' };
    }
    return sweepTwitter({ runs: body.runs, notes: body.notes, prune: body.prune ?? false });
  },
  {
    body: t.Object({
      runs: t.Integer({ minimum: 0, maximum: 10 }),
      notes: t.Integer({ minimum: 1, maximum: 200 }),
      prune: t.Optional(t.Boolean()),
    }),
  },
);
