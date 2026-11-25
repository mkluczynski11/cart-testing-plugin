// The run record of design 8.5 and the classification of its repeats into one verdict, in the order of
// design 6.1: environment, the first failed step, stability across repeats, completeness.
import type { CheckpointRecord } from './checkpoint';
import type { NetworkLog } from './live-controls';
import type { FailureRecord } from './shopper';
import type { Verdict } from './verdicts';

export type RunMeta = {
  runId: string;
  slug: string;
  scenarioSha256: string | null;
  testSha256: string | null;
  testOrigin: 'compiled' | 'edited' | null;
  timestamp: string;
  baseURL: string;
  browser: string;
  locale: string;
  priceSource: string;
  pluginVersion: string;
  gitSha: string | null;
  gitDirty: boolean | null;  // uncommitted changes or new files when the run started: gitSha alone does not name the code
  mode: 'dry' | 'live';
  defect: string | null;
};

/** One repeat of the test: its result, the failure that ended it and every checkpoint it judged. */
export type RepeatRecord = {
  n: number;
  result: 'pass' | 'fail';
  status: string;
  error: (FailureRecord & { url?: string | null; rawTotal: string | null }) | null;
  checkpoints: CheckpointRecord[];
  control?: NetworkLog;
  durationMs: number;
};

export type RunRecord = { meta: RunMeta; verdict: Verdict | null; repeats: RepeatRecord[]; errors: string[] };

/** The verdict of one repeat: its recorded failure, a red checkpoint, a crash, or an incomplete set. */
export function repeatVerdict(r: RepeatRecord, expected: string[]): Verdict {
  if (r.error) return r.error.kind;
  const red = r.checkpoints.find((c) => c.result === 'fail');
  if (red?.verdict) return red.verdict as Verdict;
  if (r.status !== 'passed') return 'INFRA_FAIL';
  const judged = r.checkpoints.map((c) => c.step);
  return expected.every((id) => judged.includes(id)) ? 'PASS' : 'NO_TESTS_RUN';
}

export type Classification = { verdict: Verdict; perRepeat: Verdict[]; evidence?: 'precondition' | 'action' | 'amount'; reason: string };

const EVIDENCE: Partial<Record<Verdict, Classification['evidence']>> = {
  PRECONDITION_FAIL: 'precondition', LOCATOR_FAIL: 'action', ORACLE_MISMATCH: 'amount', UNMODELED_ADJUSTMENT: 'amount',
};

/** Classify a run; `expected` are the checkpoints the test file judges. */
export function classify(run: Pick<RunRecord, 'repeats' | 'errors'>, expected: string[]): Classification {
  const other = run.errors.filter((e) => !/no tests found/i.test(e));
  if (other.length) return { verdict: 'INFRA_FAIL', perRepeat: [], reason: other[0].split('\n')[0] };
  if (run.repeats.length === 0) return { verdict: 'NO_TESTS_RUN', perRepeat: [], reason: 'Playwright executed no test' };
  const perRepeat = run.repeats.map((r) => repeatVerdict(r, expected));
  if (perRepeat.includes('INFRA_FAIL')) return { verdict: 'INFRA_FAIL', perRepeat, reason: 'the environment failed in at least one repeat' };
  const distinct = [...new Set(perRepeat)];
  if (distinct.length === 1) return { verdict: distinct[0], perRepeat, reason: `${perRepeat.length}/${perRepeat.length} repeats ended ${distinct[0]}` };
  const failed = perRepeat.find((v) => v !== 'PASS') as Verdict;
  return { verdict: 'FLAKY', perRepeat, evidence: EVIDENCE[failed], reason: `repeats ended ${perRepeat.join(', ')}` };
}
