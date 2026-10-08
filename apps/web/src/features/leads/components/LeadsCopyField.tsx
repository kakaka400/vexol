import { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export default function LeadsCopyField({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard can be blocked (no permission / insecure origin); the value stays selectable.
    }
  }

  return (
    <div className="flex items-center gap-2">
      <Input readOnly value={value} aria-label={label} className="font-mono text-xs" />
      <Button
        type="button"
        variant="outline"
        size="icon"
        onClick={copy}
        aria-label={`Copy ${label}`}
      >
        {copied ? <Check /> : <Copy />}
      </Button>
    </div>
  );
}
