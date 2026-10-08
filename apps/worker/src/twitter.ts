import { workerConfig } from './config';
import { postInternal } from './internal-api';

interface SweepResult {
  runs: number;
  written: number;
  retry: number;
  failed: number;
}

let sweepsSincePrune = 0;

// Asks the API to execute queued Twitter research and write the pending Obsidian
// notes. Research needs the project's X API token, which only the API can decrypt,
// so the worker owns the schedule and the API owns the work.
export async function processTwitterSweep(): Promise<void> {
  const cfg = workerConfig();
  const prune = ++sweepsSincePrune >= cfg.twitterPruneEverySweeps;
  if (prune) sweepsSincePrune = 0;
  let response: Response;
  try {
    response = await postInternal(
      '/internal/twitter/sweep',
      { runs: cfg.twitterRunsPerSweep, notes: cfg.twitterNotesPerSweep, prune },
      cfg.twitterTimeoutMs,
    );
  } catch (error) {
    console.error('[worker] twitter sweep could not reach the api:', error);
    return;
  }
  if (!response.ok) {
    console.error(`[worker] twitter sweep returned ${response.status}`);
    return;
  }
  const result = (await response.json().catch(() => null)) as SweepResult | null;
  if (result && (result.runs > 0 || result.written > 0 || result.failed > 0)) {
    console.log(
      `[worker] twitter: ${result.runs} research runs, ${result.written} notes written, ${result.retry} to retry, ${result.failed} failed`,
    );
  }
}
