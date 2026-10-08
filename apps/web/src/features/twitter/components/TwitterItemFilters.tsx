import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { TwitterItemFilters as Filters, TwitterRun } from '@/lib/api';
import { runLabel } from '../utils/twitter';

const ALL = 'all';

// The filters shared by the research results and the library. Each change
// replaces one key; an "all" choice or an empty field removes it.
export default function TwitterItemFilters({
  value,
  onChange,
  tags,
  runs,
}: {
  value: Filters;
  onChange: (next: Filters) => void;
  tags: string[];
  runs?: TwitterRun[];
}) {
  const set = (key: keyof Filters, next: string) =>
    onChange({ ...value, [key]: next === ALL || next === '' ? undefined : next });
  return (
    <div className="grid grid-cols-2 gap-2 md:grid-cols-3 2xl:grid-cols-6">
      <Input
        className="col-span-2 md:col-span-3 2xl:col-span-2"
        placeholder="Search text or author"
        value={value.q ?? ''}
        onChange={(e) => set('q', e.target.value)}
        aria-label="Search"
      />
      <Input
        placeholder="@handle"
        value={value.handle ?? ''}
        onChange={(e) => set('handle', e.target.value)}
        aria-label="Handle"
      />
      <Input
        placeholder="Search query"
        value={value.query ?? ''}
        onChange={(e) => set('query', e.target.value)}
        aria-label="Search query"
      />
      <Select value={value.tag ?? ALL} onValueChange={(next) => set('tag', next)}>
        <SelectTrigger aria-label="Tag" className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>All tags</SelectItem>
          {tags.map((tag) => (
            <SelectItem key={tag} value={tag}>
              #{tag}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={value.verification ?? ALL} onValueChange={(next) => set('verification', next)}>
        <SelectTrigger aria-label="Verification" className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>Any verification</SelectItem>
          <SelectItem value="unverified">Unverified</SelectItem>
          <SelectItem value="verified">Verified</SelectItem>
          <SelectItem value="disputed">Disputed</SelectItem>
        </SelectContent>
      </Select>
      <Select value={value.stored ?? ALL} onValueChange={(next) => set('stored', next)}>
        <SelectTrigger aria-label="Saved in Obsidian" className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>Saved or not</SelectItem>
          <SelectItem value="yes">Saved in Obsidian</SelectItem>
          <SelectItem value="no">Not saved yet</SelectItem>
        </SelectContent>
      </Select>
      {runs && (
        <Select value={value.runId ?? ALL} onValueChange={(next) => set('runId', next)}>
          <SelectTrigger aria-label="Research run" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All runs</SelectItem>
            {runs.map((run) => (
              <SelectItem key={run.id} value={run.id}>
                {runLabel(run).slice(0, 60)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
      <Input
        type="date"
        value={value.from ?? ''}
        onChange={(e) => set('from', e.target.value)}
        aria-label="Published from"
      />
      <Input
        type="date"
        value={value.to ?? ''}
        onChange={(e) => set('to', e.target.value)}
        aria-label="Published until"
      />
      <Select
        value={value.sort ?? 'fetched'}
        onValueChange={(next) => set('sort', next === 'fetched' ? '' : next)}
      >
        <SelectTrigger aria-label="Sort" className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="fetched">Newest fetched</SelectItem>
          <SelectItem value="published">Newest published</SelectItem>
          <SelectItem value="author">Author</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}
