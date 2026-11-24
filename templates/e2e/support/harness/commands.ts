// Subcommands example, confirm, compile. Each returns printable lines and a verdict; cli.ts prints them.
import * as fs from 'node:fs';
import * as path from 'node:path';
import { compileScenario, inspectTestFile } from '../core/compiler';
import { describeState, Ledger } from '../core/ledger';
import { formatMoney, fromDecimal } from '../core/money';
import { NO_RULES } from '../core/pricing';
import {
  freezeMessage, freezeState, paths, readScenarioFile, scenarioHash, setStatusLine, parseScenarioText,
  type Lock, type Scenario,
} from '../core/scenario';
import { describeStep, formatViolations, validateScenario } from '../core/validator';
import type { Verdict } from '../core/verdicts';

export type CommandResult = { verdict: Verdict; lines: string[]; data?: Record<string, unknown> };

const rel = (root: string, p: string) => path.relative(root, p) || p;

/** Read and validate a scenario. Returns either the scenario or a SPEC_INVALID result. */
export function loadValid(root: string, slug: string):
  | { ok: true; scenario: Scenario; data: unknown; text: string }
  | { ok: false; result: CommandResult } {
  const file = paths.scenario(root, slug);
  if (!fs.existsSync(file)) {
    return { ok: false, result: { verdict: 'SPEC_INVALID', lines: [`V1: ${rel(root, file)} does not exist; write the scenario there first.`] } };
  }
  let parsed;
  try {
    parsed = readScenarioFile(root, slug);
  } catch (e) {
    return { ok: false, result: { verdict: 'SPEC_INVALID', lines: [`V1: ${rel(root, file)} cannot be read: ${(e as Error).message}; fix the YAML front matter.`] } };
  }
  const r = validateScenario(parsed.data, slug);
  if (!r.ok) {
    const lines = formatViolations(r.violations);
    return { ok: false, result: { verdict: 'SPEC_INVALID', lines: [`Scenario ${slug} is invalid (${lines.length} violation(s)):`, ...lines.slice(0, 12)], data: { violations: r.violations } } };
  }
  return { ok: true, scenario: r.scenario, data: parsed.data, text: parsed.text };
}

/** Stub prices: aliases in declaration order get $10.00, $20.00, $30.00, ... */
export function stubPrice(index: number): string {
  return `${(index + 1) * 10}.00`;
}

export function example(root: string, slug: string): CommandResult {
  const loaded = loadValid(root, slug);
  if (!loaded.ok) return loaded.result;
  const s = loaded.scenario;
  const ledger = new Ledger(NO_RULES);
  const stub: Record<string, { price: string }> = {};
  s.aliases.forEach((alias, i) => {
    stub[alias] = { price: stubPrice(i) };
    ledger.bind(alias, { name: `${alias} (stub)`, unitPrice: fromDecimal(stubPrice(i)), inStock: true, attrs: {} });
  });
  const rows = s.steps.map((step) => {
    ledger.apply({ do: step.do, key: step.product, qty: step.qty });
    const snap = ledger.snapshot();
    return {
      step: step.id,
      action: describeStep(step),
      cart: snap.state,
      total: formatMoney(snap.total),
      composition: snap.composition,
      checkpoint: s.checkpoints.includes(step.id),
    };
  });
  const out = {
    scenario: s.id,
    prices: 'STUB',
    note: 'Stub prices, not the application\'s. No pricing rules applied. Real prices are read during the run.',
    currency: 'USD',
    stub,
    expected: rows,
  };
  const file = paths.example(root, slug);
  fs.writeFileSync(file, JSON.stringify(out, null, 2) + '\n');

  const w = { step: 5, action: 14, cart: 20 };
  const lines = [
    `Example for ${s.id}. PRICES ARE STUBS, not the application's: ${s.aliases.map((a) => `${a}=$${stub[a].price}`).join(', ')}; no pricing rules.`,
    `${'step'.padEnd(w.step)} ${'action'.padEnd(w.action)} ${'cart after'.padEnd(w.cart)} total`,
    ...rows.map((r) => `${(r.step + (r.checkpoint ? '*' : '')).padEnd(w.step)} ${r.action.padEnd(w.action)} ${describeState(r.cart).padEnd(w.cart)} ${r.total} = ${r.composition}`),
    '(* = checkpoint)',
    `Wrote ${rel(root, file)}.`,
  ];
  return { verdict: 'PASS', lines, data: out };
}

export function confirm(root: string, slug: string): CommandResult {
  const loaded = loadValid(root, slug);
  if (!loaded.ok) return loaded.result;
  const file = paths.scenario(root, slug);
  const newText = setStatusLine(loaded.text, 'confirmed');
  const newData = parseScenarioText(newText).data;
  const hash = scenarioHash(newData);
  if (hash !== scenarioHash(loaded.data)) throw new Error('confirm changed more than the status line');
  if (newText !== loaded.text) fs.writeFileSync(file, newText);
  const lock: Lock = { scenario: loaded.scenario.id, sha256: hash };
  fs.writeFileSync(paths.lock(root, slug), JSON.stringify(lock, null, 2) + '\n');
  return {
    verdict: 'PASS',
    lines: [`Confirmed ${slug}: status set to confirmed, sha256 ${hash}.`, `Wrote ${rel(root, paths.lock(root, slug))}.`],
    data: { sha256: hash },
  };
}

function shortDiff(oldText: string, newText: string): string[] {
  const a = oldText.split('\n');
  const b = newText.split('\n');
  const removed = b.filter((l) => !a.includes(l)).map((l) => `  - compiled: ${l.trim()}`);
  const added = a.filter((l) => !b.includes(l) && !l.startsWith('// ')).map((l) => `  + in file:  ${l.trim()}`);
  return [...removed, ...added].slice(0, 6);
}

export function compile(root: string, slug: string, force = false): CommandResult {
  const loaded = loadValid(root, slug);
  if (!loaded.ok) return loaded.result;
  const state = freezeState(root, slug, loaded.data);
  if (state !== 'frozen') return { verdict: 'SPEC_INVALID', lines: [`Cannot compile ${slug}: ${freezeMessage(state)}.`] };
  const text = compileScenario(loaded.scenario, scenarioHash(loaded.data));
  const file = paths.test(root, slug);
  const target = rel(root, file);
  if (fs.existsSync(file)) {
    const existing = fs.readFileSync(file, 'utf8');
    if (existing === text) return { verdict: 'PASS', lines: [`${target} is up to date; nothing written.`], data: { written: false } };
    const info = inspectTestFile(existing);
    if (!info.untouched && !force) {
      return {
        verdict: 'FILE_CONFLICT',
        lines: [`${target} was edited by hand (body hash differs); nothing written.`, ...shortDiff(existing, text), 'Move the change into the scenario, or pass --force to overwrite the file.'],
        data: { written: false },
      };
    }
    fs.writeFileSync(file, text);
    return { verdict: 'PASS', lines: [`Rewrote ${target}${info.untouched ? '' : ' (--force: hand edits discarded)'}.`], data: { written: true } };
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text, { flag: 'wx' });
  return { verdict: 'PASS', lines: [`Wrote ${target}.`], data: { written: true } };
}
