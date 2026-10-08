import { EmptyState } from '@/components/common/page/EmptyState';
import type { TwitterItem } from '@/lib/api';
import TwitterItemCard from './TwitterItemCard';

export default function TwitterItemList({
  items,
  selected,
  onSelectedChange,
  onShowChain,
  emptyTitle = 'No posts',
  emptyDescription = 'Nothing matches these filters.',
}: {
  items: TwitterItem[];
  selected?: Set<string>;
  onSelectedChange?: (next: Set<string>) => void;
  onShowChain?: (item: TwitterItem) => void;
  emptyTitle?: string;
  emptyDescription?: string;
}) {
  if (items.length === 0) return <EmptyState title={emptyTitle} description={emptyDescription} />;
  const toggle = (id: string, on: boolean) => {
    if (!selected || !onSelectedChange) return;
    const next = new Set(selected);
    if (on) next.add(id);
    else next.delete(id);
    onSelectedChange(next);
  };
  return (
    <ul className="divide-y">
      {items.map((item) => (
        <TwitterItemCard
          key={item.id}
          item={item}
          selected={selected?.has(item.id)}
          onSelect={onSelectedChange ? (on) => toggle(item.id, on) : undefined}
          onShowChain={onShowChain ? () => onShowChain(item) : undefined}
        />
      ))}
    </ul>
  );
}
