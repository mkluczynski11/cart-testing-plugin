#!/usr/bin/env -S npx tsx
// qa-harness: the command line of the deterministic harness. Every subcommand prints at most 15 lines,
// then "VERDICT: <name>", and exits 0 only for PASS. Implements design 6.1.
import * as path from 'node:path';
import { qaRoot } from '../core/config';
import { POSITIVE, QaError, type Verdict } from '../core/verdicts';
import { capLines, type CommandResult } from './common';
import { compile } from './compile';
import { defectsCommand } from './defects';
import { doctor } from './doctor';
import { example } from './example';
import { intentCommand } from './intent';
import { need } from './need';
import { report } from './report';
import { run } from './run';
import { selftest } from './selftest';
import { verify } from './verify';

const HELP: Array<[string, string]> = [
  ['doctor [--write-manifest]', 'check the environment, file integrity and the driver'],
  ['selftest', "run the harness's own test without the live application"],
  ['example <slug> [--confirm]', 'validate the scenario and compute the example; --confirm freezes it'],
  ['compile <slug> [--force]', 'emit tests/<slug>.spec.ts from the confirmed scenario'],
  ['intent <slug>', 'is there a current intent review? prints the confirmed hash'],
  ['need <slug>', 'name the actions, attributes and bindings the driver is missing'],
  ['defects list|check <slug> [--extended]', 'list the default defects; admit or reject specs/<slug>.defects.json'],
  ['run <slug> [--dry] [--repair driver|test]', 'gates G0–G2 on the reference cart, or G0–G3 live'],
  ['verify <slug>', 'gates G0–G4: the live run and the live controls, in a new run directory'],
  ['report <slug> [--promote <id> [--as-evidence]]', 'report.md of the latest run; --promote puts a verified run in the repo'],
];

const SLUG = /^[a-z0-9][a-z0-9-]*$/;

function usage(problem: string): CommandResult {
  return { verdict: 'SPEC_INVALID', lines: [problem, 'usage: qa-harness <subcommand> [--root <dir>]', ...HELP.map(([c, d]) => `  ${c.padEnd(46)} ${d}`)] };
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
  const promote = take('--promote');
  const repair = take('--repair');
  const confirm = has('--confirm');
  const force = has('--force');
  const dry = has('--dry');
  const writeManifest = has('--write-manifest');
  const asEvidence = has('--as-evidence');
  const extended = has('--extended');
  const [command, slug, ...rest] = args;
  const needSlug = () => (slug && SLUG.test(slug) && rest.length === 0 ? slug : undefined);
  switch (command) {
    case 'doctor': return slug ? usage('doctor takes no slug.') : doctor(root, writeManifest);
    case 'selftest': return selftest();
    case 'need': { const s = needSlug(); return s ? need(root, s) : usage('need needs one scenario slug.'); }
    case 'defects': {
      const s = rest[0];
      if ((slug !== 'list' && slug !== 'check') || !s || !SLUG.test(s) || rest.length !== 1) return usage('defects needs list or check and one scenario slug.');
      return defectsCommand(root, s, slug, { extended });
    }
    case 'example': { const s = needSlug(); return s ? example(root, s, confirm) : usage('example needs one scenario slug.'); }
    case 'compile': { const s = needSlug(); return s ? compile(root, s, force) : usage('compile needs one scenario slug.'); }
    case 'run': {
      const s = needSlug();
      if (!s) return usage('run needs one scenario slug.');
      if (repair !== undefined && repair !== 'driver' && repair !== 'test') return usage('--repair takes driver or test.');
      return run(root, s, { dry, repair });
    }
    case 'intent': { const s = needSlug(); return s ? intentCommand(root, s) : usage('intent needs one scenario slug.'); }
    case 'verify': { const s = needSlug(); return s ? verify(root, s) : usage('verify needs one scenario slug.'); }
    case 'report': {
      const s = needSlug();
      if (!s) return usage('report needs one scenario slug.');
      if (asEvidence && !promote) return usage('--as-evidence goes with --promote <runId>.');
      return report(root, s, promote, asEvidence);
    }
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
    if (e instanceof QaError) {
      for (const l of capLines(e.message.split('\n'), 'see the run directory')) console.log(l);
      console.log(`VERDICT: ${e.verdict}`);
      process.exitCode = 1;
      return;
    }
    console.log(`The harness failed unexpectedly: ${(e as Error)?.message ?? String(e)}`);
    console.log('Rerun the command; if it fails again, report it as a harness bug with this output.');
    const v: Verdict = 'INFRA_FAIL';
    console.log(`VERDICT: ${v}`);
    process.exitCode = 1;
  });
