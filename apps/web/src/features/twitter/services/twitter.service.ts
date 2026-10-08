import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  api,
  type TwitterDraft,
  type TwitterDraftContent,
  type TwitterItemFilters,
  type TwitterPublishInput,
  type TwitterResearchInput,
  type TwitterRun,
  type TwitterSettings,
  type TwitterVerification,
} from '@/lib/api';
import { qk } from '@/services/queryKeys';

const ACTIVE = new Set(['queued', 'running']);

// A run is followed until it has finished and its notes are confirmed written.
const unsettled = (run: TwitterRun) =>
  ACTIVE.has(run.status) || (!run.storage.complete && run.storage.failed === 0);

export function useTwitterRunsQuery(projectKey: string) {
  return useQuery({
    queryKey: qk.twitterRuns(projectKey),
    queryFn: () => api.listTwitterRuns(projectKey),
    enabled: projectKey.length > 0,
    refetchInterval: (query) => ((query.state.data ?? []).some(unsettled) ? 3000 : 30_000),
  });
}

export function useTwitterRunQuery(projectKey: string, runId: string | null) {
  return useQuery({
    queryKey: qk.twitterRun(projectKey, runId ?? ''),
    queryFn: () => api.getTwitterRun(projectKey, runId!),
    enabled: projectKey.length > 0 && runId != null,
    refetchInterval: (query) => (query.state.data && unsettled(query.state.data) ? 2000 : false),
  });
}

export function useStartTwitterResearch(projectKey: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      mode: 'runs' | 'search' | 'profile' | 'post';
      request: TwitterResearchInput;
    }) =>
      api.startTwitterResearch(projectKey, input.mode, {
        ...input.request,
        idempotencyKey: crypto.randomUUID(),
      }),
    onSuccess: (run) => {
      queryClient.setQueryData(qk.twitterRun(projectKey, run.id), run);
      void queryClient.invalidateQueries({ queryKey: ['twitter', projectKey] });
    },
  });
}

export function useTwitterItemsQuery(
  projectKey: string,
  filters: TwitterItemFilters,
  enabled = true,
) {
  return useQuery({
    queryKey: qk.twitterItems(projectKey, filters),
    queryFn: () => api.listTwitterItems(projectKey, filters),
    enabled: enabled && projectKey.length > 0,
    refetchInterval: (query) =>
      (query.state.data ?? []).some((item) => item.obsidianStatus !== 'written') ? 5000 : false,
  });
}

export function useTwitterTagsQuery(projectKey: string) {
  return useQuery({
    queryKey: qk.twitterTags(projectKey),
    queryFn: () => api.listTwitterTags(projectKey),
    enabled: projectKey.length > 0,
  });
}

export function useUpdateTwitterItems(projectKey: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (patch: {
      ids: string[];
      addTags?: string[];
      removeTags?: string[];
      verificationStatus?: TwitterVerification;
    }) => api.updateTwitterItems(projectKey, patch),
    onSuccess: ({ updated }) => {
      void queryClient.invalidateQueries({ queryKey: ['twitter', projectKey] });
      toast.success(`${updated} item${updated === 1 ? '' : 's'} updated`);
    },
  });
}

export function useTwitterDraftsQuery(projectKey: string) {
  return useQuery({
    queryKey: qk.twitterDrafts(projectKey),
    queryFn: () => api.listTwitterDrafts(projectKey),
    enabled: projectKey.length > 0,
    refetchInterval: 30_000,
  });
}

// Saves the composer: a new draft, or the next version of the open one. The
// server keeps the version when nothing changed, so autosave can call it freely.
export function useSaveTwitterDraft(projectKey: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { draft: TwitterDraft | null; content: TwitterDraftContent }) =>
      input.draft
        ? api.reviseTwitterDraft(projectKey, input.draft.id, {
            ...input.content,
            baseVersion: input.draft.currentVersion,
          })
        : api.createTwitterDraft(projectKey, {
            ...input.content,
            idempotencyKey: crypto.randomUUID(),
          }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.twitterDrafts(projectKey) });
    },
  });
}

export function useTwitterPreviewQuery(projectKey: string, draft: TwitterDraft | null) {
  return useQuery({
    queryKey: qk.twitterPreview(projectKey, draft?.id ?? '', draft?.currentVersion ?? 0),
    queryFn: () => api.previewTwitterDraft(projectKey, draft!.id),
    enabled: projectKey.length > 0 && draft != null,
  });
}

export function useSplitTwitterThread(projectKey: string) {
  return useMutation({ mutationFn: (text: string) => api.splitTwitterThread(projectKey, text) });
}

export function useTwitterVariations(projectKey: string) {
  return useMutation({
    mutationFn: (input: { text: string; tone?: string; sourceItemIds?: string[] }) =>
      api.twitterVariations(projectKey, input),
  });
}

export function useTwitterChannelsQuery(projectKey: string, enabled = true) {
  return useQuery({
    queryKey: qk.twitterChannels(projectKey),
    queryFn: () => api.listTwitterChannels(projectKey),
    enabled: enabled && projectKey.length > 0,
    retry: false,
  });
}

export function useValidateTwitterDraft(projectKey: string, draftId: string) {
  return useMutation({
    mutationFn: (input: {
      accountId?: string;
      mode: 'now' | 'schedule';
      scheduledFor?: string;
      timezone: string;
    }) => api.validateTwitterDraft(projectKey, draftId, input),
  });
}

export function usePublishTwitterDraft(projectKey: string, draftId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { mode: 'now' | 'schedule'; body: TwitterPublishInput }) =>
      api.publishTwitterDraft(projectKey, draftId, input.mode, input.body),
    onSuccess: (draft) => {
      const job = draft.publications[0];
      if (draft.status === 'published') toast.success('Published on X');
      else if (draft.status === 'scheduled') toast.success('Handed to Buffer');
      else if (job?.status === 'unknown') toast.warning('No answer from Buffer. Retrying is safe.');
      else toast.error(job?.lastError ?? 'Publishing failed');
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['twitter', projectKey] });
    },
  });
}

export function useRefreshPublishJob(projectKey: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (jobId: string) => api.getTwitterPublishJob(projectKey, jobId),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: qk.twitterDrafts(projectKey) });
    },
  });
}

export function useTwitterActivityQuery(
  projectKey: string,
  filters: { level?: string; event?: string },
) {
  return useQuery({
    queryKey: qk.twitterActivity(projectKey, filters),
    queryFn: () => api.listTwitterActivity(projectKey, filters),
    enabled: projectKey.length > 0,
    refetchInterval: 10_000,
  });
}

export function useTwitterStatusQuery(projectKey: string) {
  return useQuery({
    queryKey: qk.twitterStatus(projectKey),
    queryFn: () => api.getTwitterStatus(projectKey),
    enabled: projectKey.length > 0,
  });
}

export function useTwitterSettingsQuery(projectKey: string) {
  return useQuery({
    queryKey: qk.twitterSettings(projectKey),
    queryFn: () => api.getTwitterSettings(projectKey),
    enabled: projectKey.length > 0,
  });
}

export function useUpdateTwitterSettings(projectKey: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (patch: Partial<TwitterSettings>) => api.updateTwitterSettings(projectKey, patch),
    onSuccess: (settings) => {
      queryClient.setQueryData(qk.twitterSettings(projectKey), settings);
      toast.success('Settings saved');
    },
  });
}

export function useTestTwitterConnection(projectKey: string) {
  return useMutation({
    mutationFn: (target: 'obsidian' | 'buffer' | 'x_api') =>
      api.testTwitterConnection(projectKey, target),
    onSuccess: (result) =>
      result.ok ? toast.success(result.message) : toast.error(result.message),
  });
}

export function useRetryTwitterNotes(projectKey: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.retryTwitterNotes(projectKey),
    onSuccess: ({ requeued }) => {
      void queryClient.invalidateQueries({ queryKey: ['twitter', projectKey] });
      toast.success(`${requeued} note${requeued === 1 ? '' : 's'} requested again`);
    },
  });
}

// The Studio image library, read through the shared API client with Studio's own
// query key, so both pages share one cache.
export function useStudioImagesQuery(projectKey: string, enabled: boolean) {
  return useQuery({
    queryKey: qk.studioPosts(projectKey),
    queryFn: () => api.listStudioPosts(projectKey),
    enabled: enabled && projectKey.length > 0,
  });
}
