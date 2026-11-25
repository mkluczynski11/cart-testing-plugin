#!/usr/bin/env -S npx tsx
// qa-harness: the command line of the deterministic harness. Every subcommand prints at most 15 lines,
// then "VERDICT: <name>", and exits 0 only for PASS. Implements design 6.1.
import * as path from 'node:path';
import { qaRoot } from '../core/config';
import { POSITIVE, type Verdict } from '../core/verdicts';
import { capLines, type CommandResult } from './common';
import { compile } from './compile';
import { example } from './example';
import { run } from './run';
import { selftest } from './selftest';

const HELP: Array<[string, string]> = [
  ['selftest', "the harness's own test without the live application (design 10.8)"],
  ['example <slug> [--confirm]', 'validate the scenario, compute the stubs and the example; --confirm freezes it'],
  ['compile <slug> [--force]', 'emit tests/<slug>.spec.ts from the confirmed scenario'],
  ['run <slug> [--dry]', 'gates G0–G2 on the reference cart, or G0–G3 with a live run'],
];

const SLUG = /^[a-z0-9][a-z0-9-]*$/;

function usage(problem: string): CommandResult {
  return { verdict: 'SPEC_INVALID', lines: [problem, 'usage: qa-harness <subcommand> [--root <dir>]', ...HELP.map(([c, d]) => `  ${c.padEnd(30)} ${d}`)] };
}

async function main(argv: string[]): Promise<CommandResult> {
  const args = [...argv];
  const take = (flag: string): string | undefined => {
    const i = args.indexOf(flag);
    if (i < 0) return undefined;
    const value = args[i + 1];
    args.splice(i, 2);
    return value;
  };
  const has = (flag: string): boolean => {
    const i = args.indexOf(flag);
    if (i >= 0) args.splice(i, 1);
    return i >= 0;
  };
  const rootArg = take('--root');
  if (rootArg) process.env.QA_ROOT = path.resolve(rootArg);
  const root = qaRoot();
  if (has('--help') || args.length === 0) return { ...usage('qa-harness subcommands:'), verdict: 'PASS' };
  const confirm = has('--confirm');
  const force = has('--force');
  const dry = has('--dry');
  const [command, slug, ...rest] = args;
  const needSlug = () => (slug && SLUG.test(slug) && rest.length === 0 ? slug : undefined);
  switch (command) {
    case 'selftest': return selftest();
    case 'example': { const s = needSlug(); return s ? example(root, s, confirm) : usage('example needs one scenario slug.'); }
    case 'compile': { const s = needSlug(); return s ? compile(root, s, force) : usage('compile needs one scenario slug.'); }
    case 'run': { const s = needSlug(); return s ? run(root, s, dry) : usage('run needs one scenario slug.'); }
    default: return usage(`Unknown subcommand "${command}".`);
  }
}

main(process.argv.slice(2))
  .then((r) => {
    for (const l of capLines(r.lines, 'see the run directory or rerun with a narrower scope')) console.log(l);
    console.log(`VERDICT: ${r.verdict}`);
    process.exitCode = POSITIVE.has(r.verdict) ? 0 : 1;
  })
  .catch((e: unknown) => {
    console.log(`The harness failed unexpectedly: ${(e as Error)?.message ?? String(e)}`);
    console.log('Rerun the command; if it fails again, report it as a harness bug with this output.');
    const v: Verdict = 'INFRA_FAIL';
    console.log(`VERDICT: ${v}`);
    process.exitCode = 1;
  });
