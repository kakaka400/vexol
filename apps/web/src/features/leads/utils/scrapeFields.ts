import type { LeadFormat } from '@/lib/api';

export type ScrapeFieldKey =
  'region' | 'niche' | 'scale' | 'keywords' | 'signal' | 'maxLeads' | 'notes';

export interface ScrapeField {
  key: ScrapeFieldKey;
  label: string;
  placeholder: string;
  required: boolean;
  multiline?: boolean;
  numeric?: boolean;
}

// Free text on purpose: the values go to an AI agent, which interprets them.
export const SCRAPE_FIELDS: Record<LeadFormat, ScrapeField[]> = {
  email: [
    {
      key: 'region',
      label: 'Region',
      placeholder: 'Arnhem and surroundings, 20 km',
      required: true,
    },
    { key: 'niche', label: 'Niche', placeholder: 'Accountants and bookkeepers', required: true },
    {
      key: 'scale',
      label: 'Company size',
      placeholder: '5 to 50 employees, no chains',
      required: true,
    },
  ],
  social: [
    {
      key: 'region',
      label: 'Region and language',
      placeholder: 'Worldwide, English',
      required: true,
    },
    { key: 'niche', label: 'Niche', placeholder: 'Software', required: true },
    {
      key: 'scale',
      label: 'Account size of the commenter',
      placeholder: '100 to 50k followers',
      required: true,
    },
    {
      key: 'keywords',
      label: 'Related topics and hashtags',
      placeholder:
        'SaaS, B2B, no-code, dev tools, #buildinpublic. Leave empty to let the agent choose related topics.',
      required: false,
      multiline: true,
    },
    {
      key: 'signal',
      label: 'Lead signal',
      placeholder:
        'The comment asks how to find customers, or shows the author is building a product.',
      required: false,
      multiline: true,
    },
    { key: 'maxLeads', label: 'Max leads', placeholder: '50', required: false, numeric: true },
    {
      key: 'notes',
      label: 'Extra instructions',
      placeholder: 'Skip agencies and resellers. Prefer videos from the last 30 days.',
      required: false,
      multiline: true,
    },
  ],
};
