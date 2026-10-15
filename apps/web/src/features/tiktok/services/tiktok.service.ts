import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  api,
  type TiktokAnimation,
  type TiktokDraftInput,
  type TiktokPost,
  type TiktokPublishInput,
} from '@/lib/api';
import { qk } from '@/services/queryKeys';

const enabled = (projectKey: string) => projectKey.length > 0;

export function useTiktokTemplatesQuery(projectKey: string) {
  return useQuery({
    queryKey: qk.tiktokTemplates(projectKey),
    queryFn: () => api.listTiktokTemplates(projectKey),
    enabled: enabled(projectKey),
  });
}

export function useTiktokDraftsQuery(projectKey: string) {
  return useQuery({
    queryKey: qk.tiktokDrafts(projectKey),
    queryFn: () => api.listTiktokDrafts(projectKey),
    enabled: enabled(projectKey),
  });
}

export function useTiktokChannelsQuery(projectKey: string) {
  return useQuery({
    queryKey: qk.tiktokChannels(projectKey),
    queryFn: () => api.listTiktokChannels(projectKey),
    enabled: enabled(projectKey),
  });
}

export function useTiktokPostsQuery(projectKey: string) {
  return useQuery({
    queryKey: qk.tiktokPosts(projectKey),
    queryFn: () => api.listTiktokPosts(projectKey),
    enabled: enabled(projectKey),
  });
}

export function useSaveTiktokTemplate(projectKey: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { id: string | null; values: { name: string } & TiktokAnimation }) =>
      input.id
        ? api.updateTiktokTemplate(projectKey, input.id, input.values)
        : api.createTiktokTemplate(projectKey, input.values),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.tiktokTemplates(projectKey) });
      toast.success('Template saved');
    },
  });
}

export function useDeleteTiktokTemplate(projectKey: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (templateId: string) => api.deleteTiktokTemplate(projectKey, templateId),
    onSuccess: () =>
      void queryClient.invalidateQueries({ queryKey: qk.tiktokTemplates(projectKey) }),
    onError: (error) => toast.error(error.message),
  });
}

export function useSaveTiktokDraft(projectKey: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { id: string | null; values: TiktokDraftInput }) => {
      if (!input.id) return api.createTiktokDraft(projectKey, input.values);
      const { templateId: _templateId, ...patch } = input.values;
      return api.updateTiktokDraft(projectKey, input.id, patch);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.tiktokDrafts(projectKey) });
      toast.success('Draft saved');
    },
  });
}

export function useDeleteTiktokDraft(projectKey: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (draftId: string) => api.deleteTiktokDraft(projectKey, draftId),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: qk.tiktokDrafts(projectKey) }),
    onError: (error) => toast.error(error.message),
  });
}

export function usePublishTiktokDraft(projectKey: string, draftId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: TiktokPublishInput) => api.publishTiktokDraft(projectKey, draftId, input),
    onSuccess: (post) => {
      void queryClient.invalidateQueries({ queryKey: qk.tiktokPosts(projectKey) });
      if (post.status === 'failed') toast.error(post.lastError ?? 'Buffer refused the post');
      else if (post.status === 'unknown') toast.warning('Buffer did not answer, check the status');
      else toast.success(post.mode === 'now' ? 'Sent to TikTok' : 'Scheduled in Buffer');
    },
  });
}

export function useRefreshTiktokPost(projectKey: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (postId: string) => api.refreshTiktokPost(projectKey, postId),
    onSuccess: (post) =>
      queryClient.setQueryData<TiktokPost[]>(qk.tiktokPosts(projectKey), (posts) =>
        posts?.map((current) => (current.id === post.id ? post : current)),
      ),
    onError: (error) => toast.error(error.message),
  });
}
