import { useState } from 'react';
import { Play } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { LeadPlatform } from '@/lib/api';
import { useStartScrape } from '../services/leads.service';
import { SCRAPE_FIELDS, type ScrapeFieldKey } from '../utils/scrapeFields';
import LeadsScrapeField from './LeadsScrapeField';

type Values = Partial<Record<ScrapeFieldKey, string>>;

export default function LeadsScrapeForm({
  projectKey,
  platform,
}: {
  projectKey: string;
  platform: LeadPlatform;
}) {
  const [values, setValues] = useState<Values>({});
  const start = useStartScrape(projectKey);
  const fields = SCRAPE_FIELDS[platform.leadFormat];
  const value = (key: ScrapeFieldKey) => values[key]?.trim() ?? '';

  let blocked: string | null = null;
  if (!platform.active) blocked = `${platform.name} is not active. Turn it on under Platform.`;
  else if (!platform.agent)
    blocked = `${platform.name} has no agent yet. Create one under MCP connection.`;
  const maxLeads = value('maxLeads') ? Number(value('maxLeads')) : undefined;
  const valid =
    fields.every((field) => !field.required || value(field.key)) &&
    (maxLeads === undefined || (Number.isInteger(maxLeads) && maxLeads > 0));

  return (
    <Card className="shadow-none">
      <CardHeader>
        <CardTitle>Start a scrape</CardTitle>
        <CardDescription>
          The {platform.name} agent picks up the job through its MCP connection and reports the
          leads back to this dashboard.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (!valid || blocked) return;
            start.mutate(
              {
                platformId: platform.id,
                region: value('region'),
                niche: value('niche'),
                scale: value('scale'),
                keywords: value('keywords') || undefined,
                signal: value('signal') || undefined,
                maxLeads,
                notes: value('notes') || undefined,
              },
              { onSuccess: () => setValues({}) },
            );
          }}
        >
          <div className="grid gap-4 md:grid-cols-3">
            {fields.map((field) => (
              <LeadsScrapeField
                key={field.key}
                field={field}
                value={values[field.key] ?? ''}
                disabled={blocked != null}
                onChange={(next) => setValues((current) => ({ ...current, [field.key]: next }))}
              />
            ))}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">{blocked}</p>
            <Button type="submit" disabled={!valid || blocked != null || start.isPending}>
              <Play />
              {start.isPending ? 'Starting…' : 'Start scrape'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
