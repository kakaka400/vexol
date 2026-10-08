import { useRef, useState } from 'react';
import { Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

// Reads a picked CSV file and hands its text to onImport. With `targets` the button
// first asks which target (e.g. platform) the rows belong to.
export default function LeadsCsvImportButton({
  onImport,
  targets,
  disabled = false,
}: {
  onImport: (csv: string, targetId?: string) => void;
  targets?: { id: string; label: string }[];
  disabled?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [targetId, setTargetId] = useState<string | undefined>();

  const pick = (id?: string) => {
    setTargetId(id);
    input.current?.click();
  };

  const button = (
    <Button
      variant="outline"
      size="sm"
      disabled={disabled}
      onClick={targets ? undefined : () => pick()}
    >
      <Upload />
      Import CSV
    </Button>
  );

  return (
    <>
      <input
        ref={input}
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        onChange={async (event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (file) onImport(await file.text(), targetId);
        }}
      />
      {targets ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>{button}</DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>Import into</DropdownMenuLabel>
            {targets.map((target) => (
              <DropdownMenuItem key={target.id} onSelect={() => pick(target.id)}>
                {target.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : (
        button
      )}
    </>
  );
}
