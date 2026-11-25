// qa-harness compile <slug> [--force]: emit tests/<slug>.spec.ts from a confirmed scenario.
// Implements the compile contract of design 6.1 and R14 (no overwrite of a manual edit without --force).
import * as fs from 'node:fs';
import * as path from 'node:path';
import { compileScenario, inspectTestFile } from '../core/compiler';
import { files } from '../core/config';
import { freezeMessage } from '../core/scenario';
import { loadScenario, rel, type CommandResult } from './common';

/** The lines that differ between the compiled text and the file, at most `limit`. */
export function lineDiff(compiled: string, existing: string, limit: number): string[] {
  const a = compiled.split('\n');
  const b = existing.split('\n');
  const out = [
    ...a.filter((l) => !b.includes(l) && !l.startsWith('// ')).map((l) => `  - compiled: ${l.trim()}`),
    ...b.filter((l) => !a.includes(l) && !l.startsWith('// ')).map((l) => `  + in file:  ${l.trim()}`),
  ];
  return out.length > limit ? [...out.slice(0, limit - 1), `  … ${out.length - limit + 1} more changed line(s)`] : out;
}

export function compile(root: string, slug: string, force: boolean): CommandResult {
  const got = loadScenario(root, slug);
  if (!got.ok) return got.result;
  const { scenario, freeze, scenarioSha256 } = got.loaded;
  if (freeze !== 'frozen') return { verdict: 'SPEC_INVALID', lines: [freezeMessage(freeze, slug)] };
  const text = compileScenario(scenario, scenarioSha256);
  const file = files.test(root, slug);
  const target = rel(root, file);
  if (!fs.existsSync(file)) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, text, { flag: 'wx' });
    return { verdict: 'PASS', lines: [`Wrote ${target}.`], data: { written: true } };
  }
  const existing = fs.readFileSync(file, 'utf8');
  if (existing === text) return { verdict: 'PASS', lines: [`${target} is up to date; nothing was written.`], data: { written: false } };
  const info = inspectTestFile(existing);
  if (!info.untouched && !force) {
    return {
      verdict: 'FILE_CONFLICT',
      lines: [`${target} was edited by hand, so nothing was written. Differences:`, ...lineDiff(text, existing, 11),
        'Move the change into the scenario, or run compile with --force to discard the edit.'],
      data: { written: false },
    };
  }
  fs.writeFileSync(file, text);
  return { verdict: 'PASS', lines: [`Rewrote ${target}${info.untouched ? ' from the changed scenario' : '; the hand edit was discarded (--force)'}.`], data: { written: true } };
}
