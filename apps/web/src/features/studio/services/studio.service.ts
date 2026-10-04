import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  api,
  type StudioDraft,
  type StudioPublishTarget,
  type StudioTemplatePatch,
} from '@/lib/api';
import { qk } from '@/services/queryKeys';

export function useStudioTemplatesQuery(projectKey: string) {
  return useQuery({
    queryKey: qk.studioTemplates(projectKey),
    queryFn: () => api.listStudioTemplates(projectKey),
    enabled: projectKey.length > 0,
  });
}

// Posts are made by an agent outside this page, so the list refetches on focus
// and every half minute to pick up new ones.
export function useStudioPostsQuery(projectKey: string) {
  return useQuery({
    queryKey: qk.studioPosts(projectKey),
    queryFn: () => api.listStudioPosts(projectKey),
    enabled: projectKey.length > 0,
    refetchInterval: 30_000,
  });
}

export function useUpdateStudioTemplate(projectKey: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { slot: number; patch: StudioTemplatePatch }) =>
      api.updateStudioTemplate(projectKey, input.slot, input.patch),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.studioTemplates(projectKey) });
      toast.success('Template saved');
    },
  });
}

export function useUploadStudioTemplatePhoto(projectKey: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { slot: number; file: File }) =>
      api.uploadStudioTemplatePhoto(projectKey, input.slot, input.file),
    onSuccess: (template) => {
      void queryClient.invalidateQueries({ queryKey: qk.studioTemplates(projectKey) });
      void queryClient.invalidateQueries({ queryKey: qk.projectFiles(projectKey) });
      toast.success(`Photo saved to template ${template.slot}`);
    },
  });
}

// Vera adds drafts from outside this page, so the list refetches like the images.
export function useStudioDraftsQuery(projectKey: string) {
  return useQuery({
    queryKey: qk.studioDrafts(projectKey),
    queryFn: () => api.listStudioDrafts(projectKey),
    enabled: projectKey.length > 0,
    refetchInterval: 30_000,
  });
}

export function useStudioPublishAccountsQuery(projectKey: string, enabled: boolean) {
  return useQuery({
    queryKey: qk.studioPublishAccounts(projectKey),
    queryFn: () => api.listStudioPublishAccounts(projectKey),
    enabled: enabled && projectKey.length > 0,
    retry: false,
  });
}

// Scheduling is a person's decision, so it also records the approval the API
// requires: a draft is sent for review and approved first when it is not yet.
export function useScheduleStudioDraft(projectKey: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      draft: Pick<StudioDraft, 'id' | 'status' | 'currentVersion'>;
      scheduledFor: string;
      timezone: string;
      targets: StudioPublishTarget[];
    }) => {
      // Read fresh: a retry after a failed hand-off finds the draft already approved.
      const draft = await api.getStudioDraft(projectKey, input.draft.id);
      const version = input.draft.currentVersion;
      if (draft.currentVersion !== version) {
        throw new Error('The draft changed in the meantime. Open it to see the new version.');
      }
      if (draft.status === 'draft') {
        await api.studioDraftAction(projectKey, draft.id, 'request-review', { version });
      }
      if (draft.status === 'draft' || draft.status === 'review_requested') {
        await api.studioDraftAction(projectKey, draft.id, 'review', {
          version,
          decision: 'approved',
        });
      }
      return api.studioDraftAction(projectKey, draft.id, 'schedule', {
        version,
        scheduledFor: input.scheduledFor,
        timezone: input.timezone,
        targets: input.targets,
      });
    },
    onSuccess: (draft) => {
      queryClient.setQueryData(qk.studioDraft(projectKey, draft.id), draft);
      toast.success('Post scheduled');
    },
    // Approval may have gone through even when scheduling failed; reload either way.
    onSettled: (_data, _error, input) => {
      void queryClient.invalidateQueries({ queryKey: qk.studioDrafts(projectKey) });
      void queryClient.invalidateQueries({
        queryKey: qk.studioDraft(projectKey, input.draft.id),
      });
    },
  });
}

export function useStudioDraftQuery(projectKey: string, draftId: string | null) {
  return useQuery({
    queryKey: qk.studioDraft(projectKey, draftId ?? ''),
    queryFn: () => api.getStudioDraft(projectKey, draftId!),
    enabled: projectKey.length > 0 && draftId != null,
  });
}

export function useCreateStudioDraft(projectKey: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { caption: string; conversationId: string | null }) =>
      api.createStudioDraft(projectKey, { ...input, idempotencyKey: crypto.randomUUID() }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.studioDrafts(projectKey) });
      toast.success('Draft saved');
    },
  });
}

// Every state change returns the whole draft, which replaces the cached detail.
export function useStudioDraftAction(projectKey: string, draftId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      action: Parameters<typeof api.studioDraftAction>[2];
      body: Record<string, unknown>;
    }) => api.studioDraftAction(projectKey, draftId, input.action, input.body),
    onSuccess: (draft) => {
      queryClient.setQueryData(qk.studioDraft(projectKey, draftId), draft);
      void queryClient.invalidateQueries({ queryKey: qk.studioDrafts(projectKey), exact: true });
    },
    // A 409 means the draft changed elsewhere; reload it so the dialog shows why.
    onError: () => {
      void queryClient.invalidateQueries({ queryKey: qk.studioDraft(projectKey, draftId) });
    },
  });
}

export function useDeleteStudioPost(projectKey: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (postId: string) => api.deleteStudioPost(postId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.studioPosts(projectKey) });
      void queryClient.invalidateQueries({ queryKey: qk.projectFiles(projectKey) });
    },
  });
}
