import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api, type LinkedinPost, type LinkedinPostInput } from '@/lib/api';
import { qk } from '@/services/queryKeys';

export function useLinkedinChannelsQuery(projectKey: string) {
  return useQuery({
    queryKey: qk.linkedinChannels(projectKey),
    queryFn: () => api.listLinkedinChannels(projectKey),
    enabled: projectKey.length > 0,
  });
}

export function useLinkedinPostsQuery(projectKey: string) {
  return useQuery({
    queryKey: qk.linkedinPosts(projectKey),
    queryFn: () => api.listLinkedinPosts(projectKey),
    enabled: projectKey.length > 0,
  });
}

export function useCreateLinkedinPost(projectKey: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: LinkedinPostInput) => api.createLinkedinPost(projectKey, input),
    onSuccess: (post) => {
      void queryClient.invalidateQueries({ queryKey: qk.linkedinPosts(projectKey) });
      if (post.status === 'failed') toast.error(post.lastError ?? 'Buffer refused the post');
      else if (post.status === 'unknown') toast.warning('Buffer did not answer, check the status');
      else toast.success(post.mode === 'now' ? 'Sent to LinkedIn' : 'Scheduled in Buffer');
    },
  });
}

export function useRefreshLinkedinPost(projectKey: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (postId: string) => api.refreshLinkedinPost(projectKey, postId),
    onSuccess: (post) =>
      queryClient.setQueryData<LinkedinPost[]>(qk.linkedinPosts(projectKey), (posts) =>
        posts?.map((current) => (current.id === post.id ? post : current)),
      ),
    onError: (error) => toast.error(error.message),
  });
}
