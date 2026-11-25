// qa-harness doctor: environment, file integrity (R4–R7) and the driver's conformance (R13).
// Implements design 6.1 (doctor), 6.3 (HARNESS_MODIFIED, SCENARIO_CHANGED, VERIFICATION_STALE) and order N, 6.4.
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
import { inspectDriver } from './need';

const ORDER: Verdict[] = ['INFRA_FAIL', 'HARNESS_MODIFIED', 'SCENARIO_CHANGED', 'VERIFICATION_STALE', 'LINT_FAIL'];

function browserInstalled(): boolean {
  // A dynamic require keeps the CLI start fast when doctor is not run.
  const { chromium } = require('@playwright/test') as typeof import('@playwright/test');
  return fs.existsSync(chromium.executablePath());
}

export function doctor(root: string, write: boolean): CommandResult {
  if (write) return { verdict: 'PASS', lines: [`Wrote support/core/MANIFEST.json with ${writeManifest()} files. Do this only in the plugin repo.`] };
  const found: Array<{ verdict: Verdict; line: string }> = [];
  const ok: string[] = [];
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
  const specsDir = path.join(root, 'specs');
  const slugs = fs.existsSync(specsDir) ? fs.readdirSync(specsDir).filter((f) => f.endsWith('.md')).map((f) => f.slice(0, -3)).sort() : [];
  for (const slug of slugs) {
    const data = readScenarioFile(root, slug).data;
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
    ok.push(`${slug}: ${state === 'frozen' ? 'confirmed' : state === 'not-confirmed' ? 'draft' : 'changed'}, test ${origin}`);
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
    ok.push(`rules file ${rel(root, rulesFile)} loads`);
  } catch (e) {
    found.push({ verdict: 'LINT_FAIL', line: `The rules file cannot be used: ${(e as Error).message}` });
  }

  const verdict = ORDER.find((v) => found.some((f) => f.verdict === v)) ?? 'PASS';
  return { verdict, lines: [...found.map((f) => `${f.verdict}: ${f.line}`), ...ok.map((l) => `ok: ${l}`)] };
}
