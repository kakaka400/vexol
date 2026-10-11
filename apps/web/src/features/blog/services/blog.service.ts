'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { qk } from '@/services/queryKeys';

export function useBlogDraftsQuery() {
  return useQuery({
    queryKey: qk.blogDrafts,
    queryFn: () => api.listBlogDrafts(),
  });
}

export function useBlogPublishedQuery() {
  return useQuery({
    queryKey: qk.blogPublished,
    queryFn: () => api.listBlogPublished(),
  });
}

export function useApproveBlogDraft() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (slug: string) => api.approveBlogDraft(slug),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.blogDrafts });
      queryClient.invalidateQueries({ queryKey: qk.blogPublished });
      toast.success('Post approved and published.');
    },
    onError: () => {
      toast.error('Failed to approve post.');
    },
  });
}

export function useRejectBlogDraft() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (slug: string) => api.rejectBlogDraft(slug),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.blogDrafts });
      toast.success('Post rejected and deleted.');
    },
    onError: () => {
      toast.error('Failed to reject post.');
    },
  });
}
