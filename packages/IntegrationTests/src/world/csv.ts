/**
 * Tiny CSV reader. Headers become keys; empty cells are empty strings.
 * No quoted-comma support — these files are authored, not exported from Excel.
 */
import { readFileSync } from 'node:fs';

export function ReadCsv(path: string): Array<Record<string, string>> {
    const text = readFileSync(path, 'utf8').replace(/^\uFEFF/, '');
    const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
    if (lines.length < 2) return [];
    const headers = split(lines[0]);
    return lines.slice(1).map((line) => {
        const cells = split(line);
        const row: Record<string, string> = {};
        headers.forEach((h, i) => {
            row[h] = cells[i] ?? '';
        });
        return row;
    });
}

function split(line: string): string[] {
    return line.split(',').map((c) => c.trim());
}
