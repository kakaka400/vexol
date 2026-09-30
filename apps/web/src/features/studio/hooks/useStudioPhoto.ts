import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

// A template photo as an object URL for an <img>. It is fetched as a blob rather
// than pointed at with a src, because the vault file route needs the session
// cookie. The URL is revoked when the photo changes or the card unmounts.
export function useStudioPhoto(fileId: string | null): string | null {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!fileId) {
      setUrl(null);
      return;
    }
    let cancelled = false;
    let objectUrl: string | null = null;
    void (async () => {
      try {
        const blob = await api.downloadProjectFile(fileId);
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      } catch {
        if (!cancelled) setUrl(null);
      }
    })();
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [fileId]);

  return url;
}
