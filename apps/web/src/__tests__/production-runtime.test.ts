import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

const dockerfile = readFileSync(new URL('../../Dockerfile', import.meta.url), 'utf8');
const nextConfig = readFileSync(new URL('../../next.config.ts', import.meta.url), 'utf8');

describe('production web runtime', () => {
  test('runs the Next standalone server with Node instead of Bun', () => {
    expect(dockerfile).toContain('FROM node:22-alpine AS release');
    expect(dockerfile).toContain('CMD ["node", "apps/web/server.js"]');
  });

  test('traces the complete undici runtime used by externalized jsdom', () => {
    expect(nextConfig).toContain(
      "../../node_modules/.bun/undici@*/node_modules/undici/**/*",
    );
  });
});
