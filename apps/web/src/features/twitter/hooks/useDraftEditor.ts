import { useEffect, useRef, useState } from 'react';
import type { TwitterDraft, TwitterDraftContent } from '@/lib/api';
import { useSaveTwitterDraft } from '../services/twitter.service';

const AUTOSAVE_MS = 2500;

// The composer's working copy of a draft, and its saving. A saved draft is
// autosaved a moment after the last change; a new draft is saved when the person
// asks, because saving creates it.
export function useDraftEditor(
  projectKey: string,
  draft: TwitterDraft | null,
  initial: { tone: string; sourceIds: string[] },
  onCreated: (id: string) => void,
) {
  const [posts, setPosts] = useState<string[]>(draft?.posts ?? ['']);
  const [tone, setTone] = useState(draft?.tone ?? initial.tone);
  const [media, setMedia] = useState<string[]>(draft?.media.map((m) => m.id) ?? []);
  const [sourceIds, setSourceIds] = useState<string[]>(
    draft?.sources.map((s) => s.id) ?? initial.sourceIds,
  );
  const save = useSaveTwitterDraft(projectKey);
  const content: TwitterDraftContent = {
    posts,
    tone: tone.trim() || undefined,
    media,
    sourceItemIds: sourceIds,
  };
  const savedKey = draft
    ? JSON.stringify([
        draft.posts,
        draft.tone ?? undefined,
        draft.media.map((m) => m.id),
        draft.sources.map((s) => s.id),
      ])
    : null;
  const currentKey = JSON.stringify([posts, content.tone, media, sourceIds]);
  const dirty = savedKey !== currentKey;
  const locked = draft?.status === 'scheduled' || draft?.status === 'published';
  const latest = useRef({ content, draft });
  latest.current = { content, draft };

  const saveNow = () => {
    if (save.isPending || locked) return;
    save.mutate(
      { draft: latest.current.draft, content: latest.current.content },
      { onSuccess: (saved) => !latest.current.draft && onCreated(saved.id) },
    );
  };

  useEffect(() => {
    if (!draft || !dirty || locked || posts.some((post) => !post.trim())) return;
    const timer = setTimeout(saveNow, AUTOSAVE_MS);
    return () => clearTimeout(timer);
    // saveNow reads the latest state through the ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentKey, draft?.currentVersion]);

  return {
    posts,
    setPosts,
    tone,
    setTone,
    media,
    setMedia,
    sourceIds,
    setSourceIds,
    dirty,
    locked,
    saving: save.isPending,
    saveError: save.error?.message ?? null,
    saveNow,
  };
}
