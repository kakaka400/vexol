import { Activity, Clock, Mail, Tags } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { ScrapeRun, ScrapedLead } from '@/lib/api';
import { formatLeadDate } from '../utils/leads';

export default function LeadsStatCards({
  leads,
  runs,
}: {
  leads: ScrapedLead[];
  runs: ScrapeRun[];
}) {
  const sectors = new Set(leads.map((lead) => lead.sector).filter(Boolean)).size;
  const open = runs.filter((run) => run.status === 'queued' || run.status === 'running').length;
  const failed = runs.filter((run) => run.status === 'failed').length;
  const last = runs[0];
  const cards = [
    {
      label: 'Leads',
      value: String(leads.length),
      detail: `${new Set(leads.map((lead) => lead.platformId)).size} platform(s)`,
      icon: Mail,
    },
    {
      label: 'Sectors',
      value: String(sectors),
      detail: sectors === 0 ? 'No sectors yet' : 'Categories in the leads',
      icon: Tags,
    },
    {
      label: 'Scrapes',
      value: String(runs.length),
      detail: `${open} open · ${failed} failed`,
      icon: Activity,
    },
    {
      label: 'Last scrape',
      value: last ? formatLeadDate(last.createdAt) : '—',
      detail: last ? `${last.niche} · ${last.region}` : 'No scrapes yet',
      icon: Clock,
    },
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {cards.map((card) => (
        <Card key={card.label} className="gap-3 py-5 shadow-none">
          <CardHeader className="flex grid-cols-none flex-row items-center justify-between px-5">
            <CardTitle className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              {card.label}
            </CardTitle>
            <card.icon className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="px-5">
            <p className="truncate text-2xl font-semibold tracking-tight tabular-nums">
              {card.value}
            </p>
            <p className="mt-1 truncate text-xs text-muted-foreground">{card.detail}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
