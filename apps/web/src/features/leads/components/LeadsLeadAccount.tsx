import type { ScrapedLead } from '@/lib/api';

// A social lead's account: the handle, linked to the profile when the agent sent one.
export default function LeadsLeadAccount({ lead }: { lead: ScrapedLead }) {
  const handle = `@${lead.handle ?? lead.name}`;
  return (
    <div className="min-w-0">
      {lead.profileUrl ? (
        <a
          href={lead.profileUrl}
          target="_blank"
          rel="noreferrer"
          className="font-medium hover:underline"
        >
          {handle}
        </a>
      ) : (
        <span className="font-medium">{handle}</span>
      )}
      {lead.name !== lead.handle && (
        <span className="block truncate text-xs text-muted-foreground">{lead.name}</span>
      )}
    </div>
  );
}
