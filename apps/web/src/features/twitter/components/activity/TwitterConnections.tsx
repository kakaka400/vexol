'use client';

import { Button } from '@/components/ui/button';
import type { TwitterStatus } from '@/lib/api';
import { useTwitter } from '../../context/TwitterContext';
import { useRetryTwitterNotes, useTestTwitterConnection } from '../../services/twitter.service';
import TwitterBadge from '../TwitterBadge';

type Target = 'obsidian' | 'buffer' | 'x_api';

// The state of every connection the section depends on. Secret values never
// reach the browser; only whether each one is configured.
export default function TwitterConnections({ status }: { status: TwitterStatus }) {
  const { projectKey, canEdit } = useTwitter();
  const test = useTestTwitterConnection(projectKey);
  const retry = useRetryTwitterNotes(projectKey);
  const rows: Array<{ name: string; ok: boolean; detail: string; target?: Target }> = [
    {
      name: 'Research agent MCP',
      ok: status.researchMcp.enabled,
      detail: `${status.researchMcp.path} · ${status.researchMcp.enabled ? 'MCP on for this project' : 'turn MCP on for this project'}`,
    },
    {
      name: 'Twitter agent MCP',
      ok: status.agentMcp.enabled,
      detail: `${status.agentMcp.path} · ${status.agentMcp.enabled ? 'MCP on for this project' : 'turn MCP on for this project'}`,
    },
    {
      name: 'Obsidian',
      ok: status.obsidian.configured,
      detail: status.obsidian.configured
        ? `Vault ${status.obsidian.vaultName ?? ''} · folder ${status.obsidian.folder} · ${status.obsidian.notes.written} written, ${status.obsidian.notes.pending} pending, ${status.obsidian.notes.failed} failed`
        : 'OBSIDIAN_VAULT_DIR is not set on the API',
      target: 'obsidian',
    },
    {
      name: 'Buffer (publishing)',
      ok: status.buffer.configured,
      detail: status.buffer.configured
        ? 'API key configured'
        : 'Add a Buffer API key under Integrations',
      target: 'buffer',
    },
    {
      name: 'X API (research)',
      ok: status.xApi.configured,
      detail: status.xApi.configured
        ? 'Bearer token configured'
        : 'Without a token only post URLs can be read (X oEmbed)',
      target: 'x_api',
    },
    {
      name: 'OpenRouter (variations)',
      ok: status.openRouter.configured,
      detail: status.openRouter.configured
        ? 'Configured'
        : 'Variations need an OpenRouter credential',
    },
  ];

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-medium">Connections</h2>
      <ul className="divide-y">
        {rows.map((row) => (
          <li key={row.name} className="flex flex-wrap items-center gap-2 py-2.5 text-sm">
            <span className="min-w-0 flex-1">
              <span className="block font-medium">{row.name}</span>
              <span className="block text-xs break-words text-muted-foreground">{row.detail}</span>
            </span>
            <TwitterBadge tone={row.ok ? 'good' : 'muted'}>
              {row.ok ? 'ready' : 'not set up'}
            </TwitterBadge>
            {canEdit && row.target && (
              <Button
                size="sm"
                variant="ghost"
                disabled={test.isPending}
                onClick={() => test.mutate(row.target!)}
              >
                Test
              </Button>
            )}
          </li>
        ))}
      </ul>
      <p className="text-xs text-muted-foreground">
        Research: {status.capabilities.research.join(', ')}. Publishing through Buffer:{' '}
        {Object.entries(status.capabilities.publishing)
          .filter(([, value]) => value === true)
          .map(([key]) => key)
          .join(', ')}
        ; video is not supported.
      </p>
      {canEdit && status.obsidian.notes.failed > 0 && (
        <Button
          size="sm"
          variant="outline"
          disabled={retry.isPending}
          onClick={() => retry.mutate()}
        >
          Write {status.obsidian.notes.failed} failed notes again
        </Button>
      )}
    </section>
  );
}
