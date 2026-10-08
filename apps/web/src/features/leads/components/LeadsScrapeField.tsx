import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import type { ScrapeField } from '../utils/scrapeFields';

export default function LeadsScrapeField({
  field,
  value,
  disabled,
  onChange,
}: {
  field: ScrapeField;
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  const id = `scrape-${field.key}`;
  return (
    <div className={cn('space-y-2', field.multiline && 'md:col-span-3')}>
      <Label htmlFor={id}>
        {field.label}
        {!field.required && <span className="font-normal text-muted-foreground">(optional)</span>}
      </Label>
      {field.multiline ? (
        <Textarea
          id={id}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={field.placeholder}
          maxLength={2000}
          rows={2}
          disabled={disabled}
        />
      ) : (
        <Input
          id={id}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={field.placeholder}
          inputMode={field.numeric ? 'numeric' : undefined}
          maxLength={field.numeric ? 6 : 200}
          disabled={disabled}
        />
      )}
    </div>
  );
}
