import Modal from '@/components/common/overlay/Modal';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { API_URL, type LeadPlatform } from '@/lib/api';
import LeadsCopyField from './LeadsCopyField';

// Shown once after a platform agent is created: the API key cannot be read again.
export default function LeadsApiKeyDialog({
  projectKey,
  platform,
  apiKey,
  onClose,
}: {
  projectKey: string;
  platform: LeadPlatform;
  apiKey: string;
  onClose: () => void;
}) {
  const endpoint = `${API_URL}/mcp`;
  return (
    <Modal title={`${platform.name} agent created`} onClose={onClose} wide>
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          {platform.agent?.name ?? 'The agent'} is added to the Agents tab. Connect your scraper
          agent to the MCP endpoint below with this API key. The key is shown only once; a new one
          can be issued from the Agents tab.
        </p>
        <div className="space-y-2">
          <Label>MCP endpoint</Label>
          <LeadsCopyField value={endpoint} label="MCP endpoint" />
        </div>
        <div className="space-y-2">
          <Label>API key (Authorization: Bearer)</Label>
          <LeadsCopyField value={apiKey} label="API key" />
        </div>
        <div className="space-y-2">
          <Label>Hermes</Label>
          <LeadsCopyField
            value={`hermes mcp add vexol-${platform.slug} --url "${endpoint}" --auth header`}
            label="Hermes command"
          />
        </div>
        <p className="text-sm text-muted-foreground">
          Let the agent call <code className="text-foreground">list_scrape_jobs</code> on a schedule
          for project <code className="text-foreground">{projectKey}</code>, then{' '}
          <code className="text-foreground">start_scrape_job</code>,{' '}
          <code className="text-foreground">submit_scrape_leads</code> and{' '}
          <code className="text-foreground">finish_scrape_job</code>.
        </p>
        <div className="flex justify-end">
          <Button onClick={onClose}>Done</Button>
        </div>
      </div>
    </Modal>
  );
}
