// Classification of a run's repeats into one verdict, in the order of design 6.1:
// environment, then the first failed step, then stability across repeats, then completeness.
import type { Verdict } from '../core/verdicts';
import type { PlaywrightRun, RepeatResult } from './playwright-runner';

/** The verdict of one repeat: its recorded failure, a red checkpoint, a crash, or an incomplete set. */
export function repeatVerdict(r: RepeatResult, expected: string[]): Verdict {
  if (r.failure) return r.failure.kind;
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

export function classify(run: PlaywrightRun, expected: string[]): Classification {
  if (run.globalErrors.length || run.tests === 0) {
    const reason = run.globalErrors[0]?.split('\n')[0] ?? 'Playwright found no test to run';
    return { verdict: run.globalErrors.length ? 'INFRA_FAIL' : 'NO_TESTS_RUN', perRepeat: [], reason };
  }
  const perRepeat = run.repeats.map((r) => repeatVerdict(r, expected));
  if (perRepeat.includes('INFRA_FAIL')) return { verdict: 'INFRA_FAIL', perRepeat, reason: 'the environment failed in at least one repeat' };
  const distinct = [...new Set(perRepeat)];
  if (distinct.length === 1) return { verdict: distinct[0], perRepeat, reason: `${perRepeat.length}/${perRepeat.length} repeats ended ${distinct[0]}` };
  const failed = perRepeat.find((v) => v !== 'PASS') as Verdict;
  return { verdict: 'FLAKY', perRepeat, evidence: EVIDENCE[failed], reason: `repeats ended ${perRepeat.join(', ')}` };
}
