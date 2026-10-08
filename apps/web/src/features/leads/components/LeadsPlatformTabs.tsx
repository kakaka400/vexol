import { LayoutGrid } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { LeadPlatform } from '@/lib/api';
import { cn } from '@/lib/utils';
import { GENERAL_TAB } from '../utils/leads';

export default function LeadsPlatformTabs({
  platforms,
  selected,
  onSelect,
}: {
  platforms: LeadPlatform[];
  selected: string;
  onSelect: (slug: string) => void;
}) {
  return (
    <Tabs value={selected} onValueChange={onSelect}>
      <div className="overflow-x-auto">
        <TabsList variant="line">
          <TabsTrigger value={GENERAL_TAB}>
            <LayoutGrid />
            General
          </TabsTrigger>
          {platforms.map((platform) => (
            <TabsTrigger key={platform.id} value={platform.slug}>
              <span
                className={cn(
                  'size-1.5 rounded-full',
                  platform.active && platform.agent ? 'bg-emerald-500' : 'bg-muted-foreground/40',
                )}
                aria-hidden
              />
              {platform.name}
              {platform.leadCount > 0 && (
                <span className="text-xs text-muted-foreground tabular-nums">
                  {platform.leadCount}
                </span>
              )}
            </TabsTrigger>
          ))}
        </TabsList>
      </div>
    </Tabs>
  );
}
