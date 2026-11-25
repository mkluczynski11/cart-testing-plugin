// Verdict dictionary and the error classes that map to verdicts.
// A verdict names an observation, not a cause.

export const VERDICTS = [
  'SPEC_INVALID',
  'FILE_CONFLICT',
  'GATES_OK',
  'DEFECT_MISSED',
  'PASS',
  'ORACLE_MISMATCH',
  'UNMODELED_ADJUSTMENT',
  'LOCATOR_FAIL',
  'PRECONDITION_FAIL',
  'INFRA_FAIL',
  'FLAKY',
  'CONTROL_MISSED',
  'VERIFIED',
] as const;

export type Verdict = (typeof VERDICTS)[number];

/** Verdicts for which a subcommand exits 0. */
export const POSITIVE_VERDICTS: ReadonlySet<Verdict> = new Set<Verdict>(['PASS', 'GATES_OK', 'VERIFIED']);

export function isPositive(v: Verdict): boolean {
  return POSITIVE_VERDICTS.has(v);
}

export function verdictLine(v: Verdict): string {
  return `VERDICT: ${v}`;
}

/** Base class: every error thrown by the library carries its verdict as the first word of its message. */
export abstract class QaError extends Error {
  abstract readonly verdict: Verdict;
}

export class OracleMismatch extends QaError {
  readonly verdict = 'ORACLE_MISMATCH' as const;
  constructor(message: string) { super(message); this.name = 'OracleMismatch'; }
}

export class UnmodeledAdjustment extends QaError {
  readonly verdict = 'UNMODELED_ADJUSTMENT' as const;
  constructor(message: string) { super(message); this.name = 'UnmodeledAdjustment'; }
}

export class LocatorError extends QaError {
  readonly verdict = 'LOCATOR_FAIL' as const;
  constructor(message: string) { super(message); this.name = 'LocatorError'; }
}

export class PreconditionError extends QaError {
  readonly verdict = 'PRECONDITION_FAIL' as const;
  constructor(message: string) { super(`PRECONDITION_FAIL: ${message}`); this.name = 'PreconditionError'; }
}

export class InfraError extends QaError {
  readonly verdict = 'INFRA_FAIL' as const;
  constructor(message: string) { super(`INFRA_FAIL: ${message}`); this.name = 'InfraError'; }
}

const FAILURE_PATTERN = /\b(ORACLE_MISMATCH|UNMODELED_ADJUSTMENT|LOCATOR_FAIL|PRECONDITION_FAIL|INFRA_FAIL)\b(?: at (\S+))?/;

/** Classify a failure message from a test run: the verdict and, for checkpoint failures, the step id. */
export function classifyFailure(message: string): { verdict: Verdict; step?: string } {
  const m = FAILURE_PATTERN.exec(message);
  if (!m) return { verdict: 'INFRA_FAIL' };
  return { verdict: m[1] as Verdict, step: m[2] };
}
