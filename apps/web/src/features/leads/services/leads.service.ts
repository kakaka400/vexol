import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  api,
  type CsvImportResult,
  type LeadPlatformInput,
  type LeadPlatformPatch,
  type ScrapeRunInput,
} from '@/lib/api';
import { qk } from '@/services/queryKeys';

export function useLeadPlatformsQuery(projectKey: string) {
  return useQuery({
    queryKey: qk.leadPlatforms(projectKey),
    queryFn: () => api.listLeadPlatforms(projectKey),
    enabled: projectKey.length > 0,
  });
}

// Runs refresh while one is still queued or running, so a scrape the agent finishes
// shows up without a reload.
export function useScrapeRunsQuery(projectKey: string, platformId?: string) {
  return useQuery({
    queryKey: qk.scrapeRuns(projectKey, platformId),
    queryFn: () => api.listScrapeRuns(projectKey, platformId),
    enabled: projectKey.length > 0,
    refetchInterval: (query) =>
      query.state.data?.some((run) => run.status === 'queued' || run.status === 'running')
        ? 10_000
        : false,
  });
}

export function useScrapedLeadsQuery(projectKey: string, platformId?: string) {
  return useQuery({
    queryKey: qk.scrapedLeads(projectKey, platformId),
    queryFn: () => api.listScrapedLeads(projectKey, platformId),
    enabled: projectKey.length > 0,
  });
}

// Every lead write can change counts on platforms, runs and leads alike, so a write
// refreshes all of them. Platform writes also change the agents and roles of the project.
function useInvalidateLeads(projectKey: string) {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: qk.leads(projectKey) });
    void queryClient.invalidateQueries({ queryKey: qk.aiAgents(projectKey) });
    void queryClient.invalidateQueries({ queryKey: qk.roles(projectKey) });
  };
}

function importToast(what: string, result: CsvImportResult) {
  const parts = [`${result.created} added`];
  if (result.updated > 0) parts.push(`${result.updated} updated`);
  if (result.skipped > 0) parts.push(`${result.skipped} skipped`);
  toast.success(`${what} imported: ${parts.join(', ')}`);
}

export function useCreateLeadPlatform(projectKey: string) {
  const invalidate = useInvalidateLeads(projectKey);
  return useMutation({
    mutationFn: (input: LeadPlatformInput) => api.createLeadPlatform(projectKey, input),
    onSuccess: invalidate,
  });
}

export function useUpdateLeadPlatform(projectKey: string) {
  const invalidate = useInvalidateLeads(projectKey);
  return useMutation({
    mutationFn: (input: { platformId: string; patch: LeadPlatformPatch }) =>
      api.updateLeadPlatform(projectKey, input.platformId, input.patch),
    onSuccess: () => {
      invalidate();
      toast.success('Platform saved');
    },
  });
}

export function useDeleteLeadPlatform(projectKey: string) {
  const invalidate = useInvalidateLeads(projectKey);
  return useMutation({
    mutationFn: (platformId: string) => api.deleteLeadPlatform(projectKey, platformId),
    onSuccess: () => {
      invalidate();
      toast.success('Platform deleted');
    },
  });
}

export function useConnectLeadPlatformAgent(projectKey: string) {
  const invalidate = useInvalidateLeads(projectKey);
  return useMutation({
    mutationFn: (platformId: string) => api.connectLeadPlatformAgent(projectKey, platformId),
    onSuccess: invalidate,
  });
}

export function useImportLeadPlatforms(projectKey: string) {
  const invalidate = useInvalidateLeads(projectKey);
  return useMutation({
    mutationFn: (csv: string) => api.importLeadPlatforms(projectKey, csv),
    onSuccess: (result) => {
      invalidate();
      importToast('Platforms', result);
    },
  });
}

export function useStartScrape(projectKey: string) {
  const invalidate = useInvalidateLeads(projectKey);
  return useMutation({
    mutationFn: (input: ScrapeRunInput) => api.createScrapeRun(projectKey, input),
    onSuccess: (run) => {
      invalidate();
      toast.success(`Scrape queued for the ${run.platformName} agent`);
    },
  });
}

export function useDeleteScrapeRun(projectKey: string) {
  const invalidate = useInvalidateLeads(projectKey);
  return useMutation({
    mutationFn: (input: { runId: string; deleteLeads: boolean }) =>
      api.deleteScrapeRun(projectKey, input.runId, input.deleteLeads),
    onSuccess: () => {
      invalidate();
      toast.success('Scrape log deleted');
    },
  });
}

export function useImportScrapeRuns(projectKey: string) {
  const invalidate = useInvalidateLeads(projectKey);
  return useMutation({
    mutationFn: (csv: string) => api.importScrapeRuns(projectKey, csv),
    onSuccess: (result) => {
      invalidate();
      importToast('Scrape logs', result);
    },
  });
}

export function useDeleteScrapedLeads(projectKey: string) {
  const invalidate = useInvalidateLeads(projectKey);
  return useMutation({
    mutationFn: (ids: string[]) => api.deleteScrapedLeads(projectKey, ids),
    onSuccess: (result) => {
      invalidate();
      toast.success(`${result.deleted} lead(s) deleted`);
    },
  });
}

export function useImportScrapedLeads(projectKey: string) {
  const invalidate = useInvalidateLeads(projectKey);
  return useMutation({
    mutationFn: (input: { platformId: string; csv: string }) =>
      api.importScrapedLeads(projectKey, input.platformId, input.csv),
    onSuccess: (result) => {
      invalidate();
      importToast('Leads', result);
    },
  });
}
