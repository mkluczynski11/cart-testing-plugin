#!/usr/bin/env -S npx tsx
// qa-harness: example | confirm | compile | gates | selftest
// Every subcommand ends with "VERDICT: <name>" and exits 0 only for a positive verdict.
import { qaRoot } from '../core/scenario';
import { isPositive, verdictLine, type Verdict } from '../core/verdicts';
import { compile, confirm, example, type CommandResult } from './commands';
import { gates } from './gates';
import { selftest } from './selftest';

const USAGE = [
  'usage: qa-harness <command> [args] [--root <dir>]',
  '  example <slug>           validate; compute totals on stub prices; write specs/<slug>.example.json',
  '  confirm <slug>           set status: confirmed and write specs/<slug>.lock.json',
  '  compile <slug> [--force] emit tests/<slug>.spec.ts from a confirmed scenario',
  '  gates <slug>             dry gates G0-G2 on the reference cart',
  '  selftest                 unit tests and end-to-end cases of the harness',
];

const SLUG = /^[a-z0-9][a-z0-9-]*$/;

async function main(argv: string[]): Promise<CommandResult> {
  const args = [...argv];
  const rootAt = args.indexOf('--root');
  if (rootAt >= 0) {
    process.env.QA_ROOT = args[rootAt + 1];
    args.splice(rootAt, 2);
  }
  const force = args.includes('--force');
  const [command, slug, ...rest] = args.filter((a) => a !== '--force');
  const root = qaRoot();
  const needSlug = (): string | null => (slug && SLUG.test(slug) && rest.length === 0 ? slug : null);
  switch (command) {
    case 'example':
    case 'confirm':
    case 'compile':
    case 'gates': {
      const s = needSlug();
      if (!s) return { verdict: 'SPEC_INVALID', lines: [`${command} needs one scenario slug (lower-case letters, digits, dashes).`, ...USAGE] };
      if (command === 'example') return example(root, s);
      if (command === 'confirm') return confirm(root, s);
      if (command === 'compile') return compile(root, s, force);
      return gates(root, s);
    }
    case 'selftest':
      return selftest();
    default:
      return { verdict: 'INFRA_FAIL', lines: [command ? `unknown command "${command}"` : 'no command given', ...USAGE] };
  }
}

main(process.argv.slice(2))
  .then((r) => {
    for (const l of r.lines) console.log(l);
    console.log(verdictLine(r.verdict));
    process.exitCode = isPositive(r.verdict) ? 0 : 1;
  })
  .catch((e: unknown) => {
    console.log(`internal error: ${(e as Error)?.stack ?? String(e)}`);
    const v: Verdict = 'INFRA_FAIL';
    console.log(verdictLine(v));
    process.exitCode = 1;
  });
