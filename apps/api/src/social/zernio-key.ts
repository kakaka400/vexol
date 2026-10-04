import { findCredentialConfig } from '../integrations/store';
import { HttpError } from '../shared/lib';

// The Zernio key for a project: its own credential from Settings → Integrations,
// else the instance-wide ZERNIO_API env key, which only serves ZERNIO_PROJECT_KEY.
export async function resolveZernioKey(project: { id: number; key: string }): Promise<string> {
  const stored = await findCredentialConfig(project.id, 'zernio');
  if (typeof stored?.apiKey === 'string' && stored.apiKey) return stored.apiKey;

  const envKey = process.env.ZERNIO_API;
  const envProject = process.env.ZERNIO_PROJECT_KEY;
  if (envKey && envProject && envProject.toLowerCase() === project.key.toLowerCase()) {
    return envKey;
  }
  throw new HttpError(503, 'Add a Zernio API key in Settings → Integrations to enable Social');
}
