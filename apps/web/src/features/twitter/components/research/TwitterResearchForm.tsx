'use client';

import { useState } from 'react';
import { Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useTwitter } from '../../context/TwitterContext';
import { useStartTwitterResearch, useTwitterSettingsQuery } from '../../services/twitter.service';
import {
  EMPTY_RESEARCH_FORM,
  researchMode,
  researchRequest,
  type ResearchFormValues,
} from '../../utils/twitter';

const FIELDS: Array<{ key: keyof ResearchFormValues; label: string; placeholder: string }> = [
  { key: 'handles', label: 'X handles', placeholder: '@vexoleu, @another' },
  { key: 'profileUrl', label: 'Profile URL', placeholder: 'https://x.com/vexoleu' },
  { key: 'postUrls', label: 'Post URLs', placeholder: 'https://x.com/vexoleu/status/…' },
  { key: 'terms', label: 'Search terms', placeholder: 'ai agents, customer support' },
  { key: 'hashtags', label: 'Hashtags', placeholder: '#ai, #saas' },
  { key: 'tags', label: 'Tags', placeholder: 'launch, competitor' },
];

export default function TwitterResearchForm({ onStarted }: { onStarted: (runId: string) => void }) {
  const { projectKey } = useTwitter();
  const settings = useTwitterSettingsQuery(projectKey).data;
  const start = useStartTwitterResearch(projectKey);
  const [values, setValues] = useState<ResearchFormValues>(EMPTY_RESEARCH_FORM);
  const set = (key: keyof ResearchFormValues) => (value: string) =>
    setValues((current) => ({ ...current, [key]: value }));

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const request = researchRequest(values);
    start.mutate(
      { mode: researchMode(request), request },
      { onSuccess: (run) => onStarted(run.id) },
    );
  };

  return (
    <form onSubmit={submit} className="space-y-4" aria-label="Research">
      <div className="space-y-1.5">
        <Label htmlFor="twitter-question">Research question</Label>
        <Textarea
          id="twitter-question"
          rows={2}
          placeholder="What do founders say about AI agents in customer support?"
          value={values.question}
          onChange={(e) => set('question')(e.target.value)}
        />
      </div>
      {FIELDS.map((field) => (
        <div key={field.key} className="space-y-1.5">
          <Label htmlFor={`twitter-${field.key}`}>{field.label}</Label>
          <Input
            id={`twitter-${field.key}`}
            placeholder={field.placeholder}
            value={values[field.key]}
            onChange={(e) => set(field.key)(e.target.value)}
          />
        </div>
      ))}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="twitter-since">From</Label>
          <Input
            id="twitter-since"
            type="date"
            value={values.since}
            onChange={(e) => set('since')(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="twitter-until">Until</Label>
          <Input
            id="twitter-until"
            type="date"
            value={values.until}
            onChange={(e) => set('until')(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="twitter-language">Language</Label>
          <Input
            id="twitter-language"
            placeholder={settings?.defaultLanguage ?? 'en'}
            maxLength={3}
            value={values.language}
            onChange={(e) => set('language')(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="twitter-max">Max results</Label>
          <Input
            id="twitter-max"
            type="number"
            min={1}
            max={100}
            placeholder={String(settings?.maxResults ?? 25)}
            value={values.maxResults}
            onChange={(e) => set('maxResults')(e.target.value)}
          />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="twitter-context">Project context</Label>
        <Textarea
          id="twitter-context"
          rows={2}
          placeholder="Optional: what this research is for"
          value={values.context}
          onChange={(e) => set('context')(e.target.value)}
        />
      </div>
      {start.isError && <p className="text-sm text-destructive">{start.error.message}</p>}
      <Button type="submit" disabled={start.isPending} className="w-full">
        <Search className="size-3.5" />
        {start.isPending ? 'Starting…' : 'Start research'}
      </Button>
      <p className="text-xs text-muted-foreground">
        Only public posts are read, through the X API or X oEmbed. A refusal or rate limit stops the
        run; nothing is published.
      </p>
    </form>
  );
}
