// qa-harness run <slug> [--dry]: gates G0–G2 dry, or G0–G3 with a live run, in a new run directory.
// Implements design 6.1 (run, classification order), 10 (gates) and 8.5 (run evidence).
import * as fs from 'node:fs';
import { files } from '../core/config';
import { freezeMessage } from '../core/scenario';
import { classify } from './classify';
import { loadScenario, rel, type CommandResult, type Loaded } from './common';
import { runPlaywright, type PlaywrightRun } from './playwright-runner';
import { createRunDir } from './run-dir';

/** One line per checkpoint of a repeat: expected, displayed raw text and result. */
export function checkpointLines(run: PlaywrightRun, n = 0): string[] {
  const r = run.repeats[n];
  if (!r) return [];
  return r.checkpoints.map((c) => {
    const shown = c.displayed && 'total' in c.displayed && c.displayed.total ? `"${c.displayed.total.rawText}" in row "${c.displayed.total.label}"` : 'no total shown';
    return `${c.step.padEnd(4)} ${c.action.padEnd(38)} expected ${c.expected.composition.split(' = ')[0].padEnd(9)} displayed ${shown}  ${c.result}`;
  });
}

export async function liveGate(loaded: Loaded, runDir: string): Promise<{ run: PlaywrightRun; verdict: CommandResult['verdict']; lines: string[] }> {
  const { config, scenario } = loaded;
  const repeat = config.repeat;
  const run = await runPlaywright({ root: loaded.root, project: 'live', slug: loaded.slug, runDir, repeat, timeoutMs: repeat * config.timeouts.testMs + 60_000 });
  const c = classify(run, scenario.checkpoints);
  const pass = c.perRepeat.filter((v) => v === 'PASS').length;
  const lines = [`G3 live, ${repeat} repeat(s) on ${config.baseURL}: ${pass}/${c.perRepeat.length} pass; ${c.reason}`];
  const seen = new Map((run.repeats[0]?.checkpoints ?? []).flatMap((c) => c.ledger).map((p) => [p.name, p]));
  const products = [...seen.values()];
  if (products.length) lines.push(`   products: ${products.map((p) => `${p.name} (${p.unitPrice}${Object.keys(p.attrs).length ? `, ${Object.entries(p.attrs).map(([k, v]) => `${k} ${v}`).join(', ')}` : ''})`).join(' · ')}`);
  lines.push(...checkpointLines(run).map((l) => `   ${l}`));
  const failure = run.repeats.find((r) => r.failure)?.failure;
  if (failure) lines.push(...failure.message.split('\n').slice(0, 6).map((l) => `   ${l}`));
  return { run, verdict: c.verdict, lines };
}

export async function run(root: string, slug: string): Promise<CommandResult> {
  const got = loadScenario(root, slug);
  if (!got.ok) return got.result;
  const loaded = got.loaded;
  if (loaded.freeze !== 'frozen') return { verdict: 'SCENARIO_CHANGED', lines: [freezeMessage(loaded.freeze, slug)] };
  if (!fs.existsSync(files.test(root, slug))) return { verdict: 'FILE_CONFLICT', lines: [`${rel(root, files.test(root, slug))} does not exist; run qa-harness compile ${slug}.`] };
  const { runId, dir } = createRunDir(root, slug);
  const g3 = await liveGate(loaded, dir);
  return { verdict: g3.verdict, lines: [`Run ${runId} of ${slug}`, ...g3.lines, `Evidence: ${rel(root, dir)}/`], data: { runId } };
}
