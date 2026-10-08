import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { obsidianConfigured } from '../braindump/obsidian';

// Writes Twitter notes into the Obsidian vault that braindump already uses
// (OBSIDIAN_VAULT_DIR). Every note sits under TWITTER_FOLDER. A write goes to a
// temporary file that is renamed over the target, and is then read back: a note
// counts as stored only when the bytes on disk are the bytes rendered.

export const TWITTER_FOLDER = 'Socials/Twitter';

// A failure that a retry cannot fix: no vault configured, a path outside it, or
// a permission error. Anything else is retried.
export class VaultError extends Error {
  constructor(
    message: string,
    readonly permanent: boolean,
  ) {
    super(message);
  }
}

export { obsidianConfigured };

// EPERM and EBUSY are not here: on Windows they also come from a file that Obsidian
// or a virus scanner holds open, which a later attempt gets past.
const PERMANENT_CODES = new Set(['EACCES', 'EROFS', 'ENOTDIR', 'ENAMETOOLONG']);

// A single path segment: letters, digits, dash, underscore and dot, no leading
// dot. Everything else becomes a dash.
export function safeSegment(value: string, max = 80): string {
  const segment = value
    .normalize('NFKD')
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[.-]+/, '')
    .replace(/-+$/, '')
    .slice(0, max);
  return segment || 'untitled';
}

// The absolute path of a note inside the vault. The relative path is built by
// this module from sanitized segments; the check here holds even if a caller
// passes something else.
export function resolveInVault(root: string, relative: string): string {
  if (relative.includes('\0') || path.isAbsolute(relative) || /^[A-Za-z]:/.test(relative)) {
    throw new VaultError('Note path is not relative to the vault', true);
  }
  const parts = relative.split(/[\\/]/);
  if (parts.some((part) => part === '..' || part === '.' || part === '')) {
    throw new VaultError('Note path leaves the vault directory', true);
  }
  const base = path.resolve(root);
  const target = path.resolve(base, relative);
  if (!target.startsWith(base + path.sep)) {
    throw new VaultError('Note path leaves the vault directory', true);
  }
  return target;
}

// The name Obsidian knows the vault by: OBSIDIAN_VAULT_NAME, else the name of the
// vault directory. Used only to build obsidian:// links.
export function obsidianVaultName(): string | null {
  if (process.env.OBSIDIAN_VAULT_NAME) return process.env.OBSIDIAN_VAULT_NAME;
  const vault = process.env.OBSIDIAN_VAULT_DIR;
  return vault ? path.basename(path.resolve(vault)) : null;
}

function vaultRoot(): string {
  const vault = process.env.OBSIDIAN_VAULT_DIR;
  if (!vault) throw new VaultError('Obsidian is not configured on this instance', true);
  return vault;
}

function classify(error: unknown): VaultError {
  if (error instanceof VaultError) return error;
  const code = (error as NodeJS.ErrnoException)?.code;
  return new VaultError(
    `Could not write the note${code ? ` (${code})` : ''}`,
    code != null && PERMANENT_CODES.has(code),
  );
}

export async function writeVaultNote(relative: string, content: string): Promise<void> {
  const target = resolveInVault(vaultRoot(), relative);
  const temporary = `${target}.${randomUUID()}.tmp`;
  try {
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(temporary, content, 'utf8');
    await rename(temporary, target);
    const written = await readFile(target, 'utf8');
    if (written !== content) throw new VaultError('The note on disk differs from the write', false);
  } catch (error) {
    await rm(temporary, { force: true }).catch(() => {});
    throw classify(error);
  }
}

// Writes and removes a probe file in the Twitter folder.
export async function testVaultWrite(): Promise<void> {
  const relative = `${TWITTER_FOLDER}/.vexol-write-test-${randomUUID()}.md`;
  await writeVaultNote(relative, 'write test\n');
  await rm(resolveInVault(vaultRoot(), relative), { force: true });
}
