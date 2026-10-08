import type { ReactNode } from 'react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

const TONE = {
  good: 'border-transparent bg-secondary text-secondary-foreground',
  muted: 'text-muted-foreground',
  bad: 'border-transparent bg-destructive text-white',
} as const;

// A status chip. `tone` says what kind of state it is, not its exact name.
export default function TwitterBadge({
  tone = 'muted',
  title,
  children,
}: {
  tone?: keyof typeof TONE;
  title?: string;
  children: ReactNode;
}) {
  return (
    <Badge variant="outline" className={cn(TONE[tone])} title={title}>
      {children}
    </Badge>
  );
}
