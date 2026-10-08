'use client';

import { createContext, useContext } from 'react';

// What every part of the Twitter page needs: the project, the vault name for
// obsidian:// links, and which actions the member may take.
export interface TwitterContextValue {
  projectKey: string;
  vaultName: string | null;
  canCreate: boolean;
  canEdit: boolean;
  canPublish: boolean;
  canUseStudio: boolean;
}

export const TwitterContext = createContext<TwitterContextValue | null>(null);

export function useTwitter(): TwitterContextValue {
  const value = useContext(TwitterContext);
  if (!value) throw new Error('useTwitter must be used inside TwitterContext');
  return value;
}
