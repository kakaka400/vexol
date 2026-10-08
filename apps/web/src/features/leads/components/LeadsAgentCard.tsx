import { useState } from 'react';
import Link from 'next/link';
import { Bot, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { useShell } from '@/context/shellContext';
import { usePermissions } from '@/hooks/usePermissions';
import { API_URL, type LeadPlatform, type LeadPlatformWithKey } from '@/lib/api';
import { agentsPath, mcpServerPath } from '@/utils/paths';
import { useConnectLeadPlatformAgent } from '../services/leads.service';
import LeadsApiKeyDialog from './LeadsApiKeyDialog';
import LeadsCopyField from './LeadsCopyField';

export default function LeadsAgentCard({
  projectKey,
  platform,
}: {
  projectKey: string;
  platform: LeadPlatform;
}) {
  const { project } = useShell();
  const { can } = usePermissions();
  const connect = useConnectLeadPlatformAgent(projectKey);
  const [created, setCreated] = useState<LeadPlatformWithKey | null>(null);
  const agent = platform.agent;

  return (
    <Card className="shadow-none">
      <CardHeader>
        <CardTitle>MCP connection</CardTitle>
        <CardDescription>
          The agent of this platform reads its scrape jobs from the Vexol MCP endpoint with its own
          API key.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {agent ? (
          <div className="flex items-center justify-between gap-3 rounded-md border p-3">
            <div className="flex min-w-0 items-center gap-3">
              <Bot className="size-5 shrink-0 text-muted-foreground" />
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{agent.name}</p>
                <p className="truncate text-xs text-muted-foreground">
                  @{agent.username}
                  {agent.apiKeyStart && ` · key ${agent.apiKeyStart}…`}
                </p>
              </div>
            </div>
            <Button asChild variant="ghost" size="sm">
              <Link href={agentsPath(projectKey)}>
                Agents
                <ExternalLink />
              </Link>
            </Button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-dashed p-3">
            <p className="text-sm text-muted-foreground">This platform has no agent yet.</p>
            {can('ai_agents', 'create') && (
              <Button
                size="sm"
                disabled={connect.isPending}
                onClick={() => connect.mutate(platform.id, { onSuccess: setCreated })}
              >
                <Bot />
                Create agent
              </Button>
            )}
          </div>
        )}
        <div className="space-y-2">
          <Label>MCP endpoint</Label>
          <LeadsCopyField value={`${API_URL}/mcp`} label="MCP endpoint" />
        </div>
        {project && !project.project.mcpEnabled && (
          <p className="rounded-md border border-dashed p-2.5 text-xs text-muted-foreground">
            MCP is off for this project, so the agent cannot read jobs.{' '}
            <Link href={mcpServerPath(projectKey)} className="text-foreground underline">
              Turn it on
            </Link>
            .
          </p>
        )}
      </CardContent>
      {created && (
        <LeadsApiKeyDialog
          projectKey={projectKey}
          platform={created.platform}
          apiKey={created.apiKey}
          onClose={() => setCreated(null)}
        />
      )}
    </Card>
  );
}
