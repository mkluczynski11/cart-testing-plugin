// Runs Playwright in a child process for one compiled test and reads back what every repeat recorded.
// Implements the execution side of gates G1–G4 (design 10, 10.2): one process per run, a hard time limit.
import { spawn } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { CheckpointRecord } from '../core/checkpoint';
import { packageRoot } from '../core/config';
import type { FailureRecord } from '../core/shopper';

export type Meta = { slug: string; scenarioSha256: string; mode: 'dry' | 'live'; checkpoints: string[]; defect: string | null };

export type RepeatResult = {
  n: number;
  status: string;            // passed | failed | timedOut | interrupted | skipped
  checkpoints: CheckpointRecord[];
  failure?: FailureRecord & { url?: string | null };
  meta?: Meta;
  errorText?: string;
  durationMs: number;
};

export type PlaywrightRun = { tests: number; repeats: RepeatResult[]; globalErrors: string[]; exitCode: number | null; output: string };

export type RunRequest = {
  root: string;
  project: 'dry' | 'live';
  slug: string;
  runDir: string;              // receives report.json, the HTML report and the test artifacts
  repeat?: number;
  env?: Record<string, string>;
  timeoutMs: number;
};

const ANSI = /\u001b\[[0-9;]*m/g;

type JsonAttachment = { name: string; body?: string; path?: string };
type JsonResult = { status: string; duration: number; attachments?: JsonAttachment[]; errors?: Array<{ message?: string }> };
type JsonSuite = { specs?: Array<{ tests?: Array<{ results?: JsonResult[] }> }>; suites?: JsonSuite[] };

function collect(suite: JsonSuite, out: JsonResult[][] = []): JsonResult[][] {
  for (const spec of suite.specs ?? []) for (const t of spec.tests ?? []) out.push(t.results ?? []);
  for (const child of suite.suites ?? []) collect(child, out);
  return out;
}

function decode<T>(results: JsonResult, name: string): T[] {
  return (results.attachments ?? []).filter((a) => a.name === name && a.body)
    .map((a) => JSON.parse(Buffer.from(a.body as string, 'base64').toString('utf8')) as T);
}

/** Run tests/<slug>.spec.ts of a root in one Playwright process and parse its JSON report. */
export function runPlaywright(req: RunRequest): Promise<PlaywrightRun> {
  const pkg = packageRoot();
  const cli = require.resolve('@playwright/test/cli', { paths: [pkg] });
  fs.mkdirSync(req.runDir, { recursive: true });
  const args = [cli, 'test', '--config', path.join(pkg, 'playwright.config.ts'), '--project', req.project,
    '--repeat-each', String(req.repeat ?? 1), '--workers', '1', `tests/${req.slug}\\.spec\\.ts$`];
  const env = { ...process.env, ...req.env, QA_ROOT: req.root, QA_RUN_DIR: req.runDir, FORCE_COLOR: '0' };
  return new Promise((resolve) => {
    const child = spawn(process.execPath, args, { cwd: pkg, env });
    let output = '';
    child.stdout.on('data', (d) => { output += d; });
    child.stderr.on('data', (d) => { output += d; });
    const timer = setTimeout(() => child.kill('SIGKILL'), req.timeoutMs);
    child.on('close', (exitCode) => {
      clearTimeout(timer);
      const reportFile = path.join(req.runDir, 'report.json');
      if (!fs.existsSync(reportFile)) {
        resolve({ tests: 0, repeats: [], globalErrors: [`Playwright wrote no report: ${output.replace(ANSI, '').trim().split('\n').slice(-3).join(' | ')}`], exitCode, output });
        return;
      }
      const report = JSON.parse(fs.readFileSync(reportFile, 'utf8')) as JsonSuite & { errors?: Array<{ message?: string }> };
      const tests = collect(report);
      const repeats = tests.flatMap((results) => results).map((r, i): RepeatResult => ({
        n: i + 1,
        status: r.status,
        checkpoints: decode<CheckpointRecord>(r, 'checkpoint'),
        failure: decode<FailureRecord>(r, 'qa-failure')[0],
        meta: decode<Meta>(r, 'qa-meta')[0],
        errorText: r.errors?.map((e) => (e.message ?? '').replace(ANSI, '')).join('\n') || undefined,
        durationMs: r.duration,
      }));
      resolve({ tests: tests.length, repeats, globalErrors: (report.errors ?? []).map((e) => (e.message ?? '').replace(ANSI, '')), exitCode, output });
    });
  });
}
