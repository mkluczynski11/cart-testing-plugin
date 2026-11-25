// qa-harness compile <slug> [--force]: emit tests/<slug>.spec.ts from a confirmed scenario.
// Implements the compile contract of design 6.1 and R14 (no overwrite of a manual edit without --force).
import * as fs from 'node:fs';
import * as path from 'node:path';
import { compileScenario, inspectTestFile } from '../core/compiler';
import { files } from '../core/config';
import { freezeMessage } from '../core/scenario';
import { loadScenario, rel, type CommandResult } from './common';

/**
 * The lines that differ between the compiled text and the file, by position (a longest common subsequence), so a
 * moved or duplicated line appears with its line number; at most `limit` lines.
 */
export function lineDiff(compiled: string, existing: string, limit: number): string[] {
  const a = compiled.split('\n');
  const b = existing.split('\n');
  const lcs = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--) for (let j = b.length - 1; j >= 0; j--) lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
  const out: string[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) { i++; j++; continue; }
    if (j < b.length && (i === a.length || lcs[i][j + 1] >= lcs[i + 1][j])) {
      if (!b[j].startsWith('// ')) out.push(`  + in file:  line ${j + 1}: ${b[j].trim()}`);
      j++;
    } else {
      if (!a[i].startsWith('// ')) out.push(`  - compiled: line ${i + 1}: ${a[i].trim()}`);
      i++;
    }
  }
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
    try {
      fs.writeFileSync(file, text, { flag: 'wx' });
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e;
      return { verdict: 'FILE_CONFLICT', lines: [`${target} is in the way: a link or a file the harness cannot read, so nothing was written.`, `Remove ${target} and run compile ${slug} again.`], data: { written: false } };
    }
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
