// A cell is quoted only when it contains a comma, quote or line break. A leading
// = + - @ is prefixed with ' so a spreadsheet does not run the cell as a formula.
export function csvCell(value: string | number | boolean | null | undefined): string {
  let text = value == null ? '' : String(value);
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function toCsv(
  header: string[],
  rows: (string | number | boolean | null | undefined)[][],
): string {
  return [header, ...rows].map((row) => row.map(csvCell).join(',')).join('\n') + '\n';
}

export function downloadCsv(filename: string, csv: string): void {
  // A byte order mark makes Excel read the file as UTF-8.
  const blob = new Blob(['\u{FEFF}', csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
