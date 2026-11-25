// Runs Playwright in a child process for one compiled test and reads back the run.json its reporter wrote.
// Implements the execution side of gates G1–G4 (design 10, 10.2): one process per run, a hard time limit.
import { spawn } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { RunRecord } from '../core/classification';
import { packageRoot } from '../core/config';

export type RunRequest = {
  root: string;
  project: 'dry' | 'live';
  slug: string;
  runDir: string;              // receives run.json, the HTML report and the test artifacts
  repeat?: number;
  testTimeoutMs?: number;      // overrides the configured test limit (control runs, design 8.6)
  env?: Record<string, string>;
  timeoutMs: number;
};

const ANSI = /\u001b\[[0-9;]*m/g;

/** Run tests/<slug>.spec.ts of a root in one Playwright process. A missing run.json is an environment failure. */
export function runPlaywright(req: RunRequest): Promise<RunRecord> {
  const pkg = packageRoot();
  const cli = require.resolve('@playwright/test/cli', { paths: [pkg] });
  fs.mkdirSync(req.runDir, { recursive: true });
  const args = [cli, 'test', '--config', path.join(pkg, 'playwright.config.ts'), '--project', req.project,
    '--repeat-each', String(req.repeat ?? 1), '--workers', '1', ...(req.testTimeoutMs ? ['--timeout', String(req.testTimeoutMs)] : []),
    `tests/${req.slug}\\.spec\\.ts$`];
  const env = { ...process.env, ...req.env, QA_ROOT: req.root, QA_RUN_DIR: req.runDir, FORCE_COLOR: '0' };
  return new Promise((resolve) => {
    const child = spawn(process.execPath, args, { cwd: pkg, env });
    let output = '';
    child.stdout.on('data', (d) => { output += d; });
    child.stderr.on('data', (d) => { output += d; });
    const timer = setTimeout(() => child.kill('SIGKILL'), req.timeoutMs);
    child.on('close', () => {
      clearTimeout(timer);
      const file = path.join(req.runDir, 'run.json');
      const record = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) as RunRecord : undefined;
      if (record) { resolve(record); return; }
      const tail = output.replace(ANSI, '').trim().split('\n').slice(-3).join(' | ');
      resolve({ meta: { runId: path.basename(req.runDir), slug: req.slug } as RunRecord['meta'], verdict: null, repeats: [], errors: [`Playwright wrote no run.json: ${tail}`] });
    });
  });
}
