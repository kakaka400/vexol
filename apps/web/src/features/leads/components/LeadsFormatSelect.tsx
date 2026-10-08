import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { LeadFormat } from '@/lib/api';
import { LEAD_FORMAT_LABEL } from '../utils/leads';

export default function LeadsFormatSelect({
  id,
  value,
  disabled = false,
  onChange,
}: {
  id: string;
  value: LeadFormat;
  disabled?: boolean;
  onChange: (value: LeadFormat) => void;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>Lead format</Label>
      <Select
        value={value}
        onValueChange={(next) => onChange(next as LeadFormat)}
        disabled={disabled}
      >
        <SelectTrigger id={id} className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {(Object.keys(LEAD_FORMAT_LABEL) as LeadFormat[]).map((format) => (
            <SelectItem key={format} value={format}>
              {LEAD_FORMAT_LABEL[format]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
