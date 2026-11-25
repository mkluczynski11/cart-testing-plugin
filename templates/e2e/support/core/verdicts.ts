// The verdict dictionary, the evidence-based routing table and the errors that carry a verdict.
// Implements design 6.3. A verdict names an observation, not a cause.

export const VERDICTS = [
  'SPEC_INVALID', 'INTENT_OK', 'FILE_CONFLICT', 'LINT_FAIL', 'CONFORMANCE_FAIL', 'DEFECT_LATE', 'DEFECT_MISSED',
  'INFRA_FAIL', 'PRECONDITION_FAIL', 'NO_TESTS_RUN', 'LOCATOR_FAIL', 'FLAKY', 'ORACLE_MISMATCH',
  'UNMODELED_ADJUSTMENT', 'CONTROL_MISSED', 'PASS', 'HARNESS_MODIFIED', 'SCENARIO_CHANGED', 'VERIFICATION_STALE',
  'RETRY_REFUSED', 'LIMIT_REACHED', 'VERIFIED', 'REWORK', 'NEEDS_TESTER', 'UNDETERMINED',
] as const;

export type Verdict = (typeof VERDICTS)[number];

/** Positive verdicts: PASS from the harness; INTENT_OK and VERIFIED from agents. Only these exit 0. */
export const POSITIVE: ReadonlySet<Verdict> = new Set<Verdict>(['PASS', 'INTENT_OK', 'VERIFIED']);

/** Who reacts to a verdict that has several possible owners, by the evidence recorded (6.3). */
export type Routing = { verdict: 'CONTROL_MISSED' | 'FLAKY'; evidence: string; route: string };

export const ROUTING: readonly Routing[] = [
  { verdict: 'CONTROL_MISSED', evidence: 'not-activated',
    route: 'network controls: app-mapper fixes the request bindings; skew-total: one question to the tester about the label of the total' },
  { verdict: 'CONTROL_MISSED', evidence: 'active-shown-green',
    route: 'app-mapper: the driver reads a different field than the one labelled as the total' },
  { verdict: 'CONTROL_MISSED', evidence: 'active-not-shown',
    route: 'UNDETERMINED: the control was ineffective; no charge against the driver' },
  { verdict: 'FLAKY', evidence: 'precondition',
    route: 'the application data changed between repeats: one retry, then UNDETERMINED' },
  { verdict: 'FLAKY', evidence: 'action',
    route: "app-mapper fixes the action's completion signal" },
  { verdict: 'FLAKY', evidence: 'amount',
    route: 'the tester, with the distribution of results and the last read: a possible application bug or a settleMs that is too short' },
];

export function routeFor(verdict: Routing['verdict'], evidence: string): string {
  return ROUTING.find((r) => r.verdict === verdict && r.evidence === evidence)?.route ?? 'UNDETERMINED: the evidence does not settle the cause';
}

/** An error that carries the verdict of what failed. */
export abstract class QaError extends Error {
  abstract readonly verdict: Verdict;
}

/** An action did not find its element or got no acknowledgment, or a read is not an amount. */
export class LocatorError extends QaError {
  readonly verdict = 'LOCATOR_FAIL' as const;
  constructor(message: string) { super(message); this.name = 'LocatorError'; }
}

/** A precondition is not met; `rawText` is the application's own message, verbatim, when there is one. */
export class PreconditionError extends QaError {
  readonly verdict = 'PRECONDITION_FAIL' as const;
  constructor(message: string, readonly rawText?: string) { super(message); this.name = 'PreconditionError'; }
}

/** The environment failed: browser, network, a 5xx response, a missing binary. */
export class InfraError extends QaError {
  readonly verdict = 'INFRA_FAIL' as const;
  constructor(message: string) { super(message); this.name = 'InfraError'; }
}

/** A checkpoint judged the cart wrong; `verdict` is ORACLE_MISMATCH, UNMODELED_ADJUSTMENT or LOCATOR_FAIL. */
export class CheckpointError extends QaError {
  constructor(message: string, readonly verdict: 'ORACLE_MISMATCH' | 'UNMODELED_ADJUSTMENT' | 'LOCATOR_FAIL', readonly step: string) {
    super(message);
    this.name = 'CheckpointError';
  }
}

/** The verdict an arbitrary error stands for: library errors carry theirs; anything else is the environment. */
export function verdictOf(e: unknown): Verdict {
  return e instanceof QaError ? e.verdict : 'INFRA_FAIL';
}
