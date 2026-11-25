// qa-harness doctor: environment, file integrity (R4–R7) and the driver's conformance (R13).
// Implements design 6.1 (doctor), 6.3 (HARNESS_MODIFIED, SCENARIO_CHANGED, VERIFICATION_STALE) and order N, 6.4.
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { inspectTestFile } from '../core/compiler';
import { files, loadConfig } from '../core/config';
import type { ExampleFile } from '../core/example';
import { fileHash, freezeState, readScenarioFile } from '../core/scenario';
import type { Verdict } from '../core/verdicts';
import { loadPricing, rel, type CommandResult } from './common';
import { lintDriver } from './lint';
import { manifestChanges, writeManifest } from './manifest';
import { intentReview } from './intent';
import { inspectDriver } from './need';

const ORDER: Verdict[] = ['INFRA_FAIL', 'HARNESS_MODIFIED', 'SPEC_INVALID', 'SCENARIO_CHANGED', 'VERIFICATION_STALE', 'LINT_FAIL'];

/** Scenario slugs of a root: specs/*.md without the intent reviews (specs/<slug>.intent.md). */
export function scenarioSlugs(root: string): string[] {
  const dir = path.join(root, 'specs');
  return fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.md') && !f.endsWith('.intent.md')).map((f) => f.slice(0, -3)).sort() : [];
}

/**
 * Type-check the driver and the rules file with the root's own TypeScript, when the root has a tsconfig.json and
 * TypeScript is installed for it. The first compiler message about either file, or null; 'skipped' without a compiler.
 */
export function typeCheck(root: string, app: string): string | null | 'skipped' {
  const tsconfig = path.join(root, 'tsconfig.json');
  let tsc: string;
  try {
    tsc = path.join(path.dirname(require.resolve('typescript/package.json', { paths: [root] })), 'bin', 'tsc');
  } catch {
    return 'skipped';
  }
  if (!fs.existsSync(tsconfig)) return 'skipped';
  // The compiler runs without the loader hooks of the calling process (tsx, Playwright), as a tester would run it.
  const env: NodeJS.ProcessEnv = { ...process.env };
  delete env.NODE_OPTIONS;
  const r = spawnSync(process.execPath, [tsc, '--noEmit', '--pretty', 'false', '-p', tsconfig], { cwd: root, encoding: 'utf8', timeout: 120_000, env });
  const mine = `${r.stdout}${r.stderr}`.split('\n').filter((l) => /error TS\d+/.test(l) && (l.includes(`${app}.driver.ts`) || l.includes(`${app}.pricing.ts`)));
  return mine[0]?.trim() ?? null;
}

function browserInstalled(): boolean {
  // A dynamic require keeps the CLI start fast when doctor is not run.
  const { chromium } = require('@playwright/test') as typeof import('@playwright/test');
  return fs.existsSync(chromium.executablePath());
}

export function doctor(root: string, write: boolean): CommandResult {
  if (write) return { verdict: 'PASS', lines: [`Wrote support/core/MANIFEST.json with ${writeManifest()} files. Do this only in the plugin repo.`] };
  const found: Array<{ verdict: Verdict; line: string }> = [];
  const ok: string[] = [];
  const notes: string[] = [];
  const major = Number(process.versions.node.split('.')[0]);
  if (major < 20) found.push({ verdict: 'INFRA_FAIL', line: `Node ${process.versions.node} is older than 20; install Node 20 or later.` });
  if (!browserInstalled()) found.push({ verdict: 'INFRA_FAIL', line: 'The Playwright Chromium browser is not installed; run npx playwright install chromium.' });
  else ok.push(`Node ${process.versions.node}, Chromium installed`);

  const changed = manifestChanges();
  if (changed.length) found.push({ verdict: 'HARNESS_MODIFIED', line: `The library differs from the manifest in ${changed.length} file(s): ${changed.slice(0, 4).join(', ')}; restore them from the plugin.` });
  else ok.push('support/core and support/harness match the manifest');

  const config = loadConfig(root);
  const rulesFile = files.pricing(root, config.app);
  const rulesSha = fs.existsSync(rulesFile) ? fileHash(rulesFile) : '';
  for (const slug of scenarioSlugs(root)) {
    let data: unknown;
    try {
      data = readScenarioFile(root, slug).data;
    } catch (e) {
      found.push({ verdict: 'SPEC_INVALID', line: `${rel(root, files.scenario(root, slug))} cannot be read (${(e as Error).message.split('\n')[0]}); fix its YAML front matter.` });
      continue;
    }
    const exFile = files.example(root, slug);
    const ex = fs.existsSync(exFile) ? JSON.parse(fs.readFileSync(exFile, 'utf8')) as ExampleFile : undefined;
    const state = freezeState(data, ex?.confirmed, rulesSha);
    if (state === 'scenario-changed' || state === 'rules-changed') {
      found.push({ verdict: 'SCENARIO_CHANGED', line: `${slug}: the ${state === 'scenario-changed' ? 'scenario' : 'rules file'} changed after confirmation; show the new example and run example ${slug} --confirm.` });
    }
    const test = files.test(root, slug);
    const origin = fs.existsSync(test) ? (inspectTestFile(fs.readFileSync(test, 'utf8')).untouched ? 'compiled' : 'edited by hand') : 'not compiled';
    const verification = path.join(files.reports(root, slug), 'verification.json');
    if (fs.existsSync(verification) && fs.existsSync(test)) {
      const v = JSON.parse(fs.readFileSync(verification, 'utf8')) as { testSha256: string; driverSha256: string | null; rulesSha256: string };
      const driver = files.driver(root, config.app);
      const stale = [v.testSha256 !== fileHash(test) && 'the test', v.driverSha256 !== (fs.existsSync(driver) ? fileHash(driver) : null) && 'the driver', v.rulesSha256 !== rulesSha && 'the rules file'].filter(Boolean);
      if (stale.length) found.push({ verdict: 'VERIFICATION_STALE', line: `${slug}: ${stale.join(', ')} changed after verification; run qa-harness verify ${slug}.` });
    }
    const intent = intentReview(root, slug);
    if (intent.state === 'stale' && fs.existsSync(verification)) {
      found.push({ verdict: 'VERIFICATION_STALE', line: `${slug}: the intent review reviews scenario ${intent.reviewed?.slice(0, 12)}…, the confirmed scenario is ${intent.confirmed?.slice(0, 12)}…; test-verifier reviews it again (step 3a), then verify.` });
    } else if (intent.state === 'stale') notes.push(`${slug}: the intent review is stale (qa-harness intent ${slug}).`);
    if (origin === 'edited by hand') notes.push(`${slug}: the test was edited by hand; compile ${slug} shows the difference, and the report says so.`);
    else if (state === 'frozen' || state === 'not-confirmed') ok.push(`${slug}: ${state === 'frozen' ? 'confirmed' : 'draft'}, test ${origin}`);
  }

  const driverFile = files.driver(root, config.app);
  const driver = inspectDriver(root, config.app);
  if (typeof driver === 'string') found.push({ verdict: 'LINT_FAIL', line: `The driver of ${config.app}: ${driver}; app-mapper writes it.` });
  else {
    const missing = ['candidates', 'productFacts', 'addProduct', 'setQuantity', 'remove', 'readCart'].filter((m) => typeof (driver as unknown as Record<string, unknown>)[m] !== 'function');
    if (missing.length || !driver.controls || !Array.isArray(driver.provides?.attrs)) {
      found.push({ verdict: 'LINT_FAIL', line: `The driver of ${config.app} does not satisfy CartDriver: ${[...missing, ...(!driver.controls ? ['controls'] : []), ...(!Array.isArray(driver.provides?.attrs) ? ['provides.attrs'] : [])].join(', ')} missing.` });
    }
    const violations = lintDriver(rel(root, driverFile), fs.readFileSync(driverFile, 'utf8'), config.baseURL ? new URL(config.baseURL).origin : '');
    for (const v of violations.slice(0, 3)) found.push({ verdict: 'LINT_FAIL', line: `${v.file}:${v.line} ${v.rule}` });
    if (!missing.length && !violations.length) ok.push(`driver ${rel(root, driverFile)} satisfies CartDriver and stays within the UI`);
  }
  try {
    loadPricing(root, config.app);
    ok.push(`rules file ${rel(root, rulesFile)} loads and stays within the vocabulary of design 9.2`);
  } catch (e) {
    found.push({ verdict: 'LINT_FAIL', line: `The rules file cannot be used: ${(e as Error).message}` });
  }
  const typed = typeCheck(root, config.app);
  if (typed === 'skipped') notes.push('no TypeScript compiler installed for this root, so the driver and the rules file were not type-checked.');
  else if (typed) found.push({ verdict: 'LINT_FAIL', line: `tsc: ${typed}` });
  else ok.push(`tsc: the driver and the rules file type-check`);

  const verdict = ORDER.find((v) => found.some((f) => f.verdict === v)) ?? 'PASS';
  return { verdict, lines: [...found.map((f) => `${f.verdict}: ${f.line}`), ...notes.map((l) => `note: ${l}`), ...ok.map((l) => `ok: ${l}`)] };
}
