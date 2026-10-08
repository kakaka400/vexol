import { collect } from './adapters';
import { processNoteJobs } from './ingest';
import { claimRun, failRun, pruneActivity, saveRunResults, type ClaimedRun } from './store';

// Executes one claimed research run: collect from the adapters, then store the
// results and settle the run (store.saveRunResults).
export async function executeRun(run: ClaimedRun): Promise<void> {
  let result;
  try {
    result = await collect(run.projectId, run.input);
  } catch (error) {
    await failRun(run, error instanceof Error ? error.message : 'Research failed');
    return;
  }
  await saveRunResults(run, result);
}

// Runs one research run now, in the caller's request: the direct lookups
// (search, profile, post) answer with their results.
export async function executeNow(runId: string): Promise<void> {
  const run = await claimRun(runId);
  if (run) await executeRun(run);
}

// One pass of the Twitter background work, called by the worker: at most
// `runs` research runs one after the other, then the due Obsidian writes.
export async function sweepTwitter(options: { runs: number; notes: number; prune: boolean }) {
  let executed = 0;
  for (; executed < options.runs; executed += 1) {
    const run = await claimRun();
    if (!run) break;
    await executeRun(run);
  }
  const notes = await processNoteJobs(options.notes);
  if (options.prune) await pruneActivity();
  return { runs: executed, ...notes };
}

// Starts the background work right away in the API process instead of waiting
// for the worker's next pass. Claims use row locks, so the worker and this never
// execute the same run or note twice.
export function kickTwitterSweep(): void {
  if (process.env.NODE_ENV === 'test') return;
  setTimeout(() => {
    sweepTwitter({ runs: 1, notes: 50, prune: false }).catch((error) =>
      console.error('[twitter] background sweep failed:', error),
    );
  }, 0);
}
