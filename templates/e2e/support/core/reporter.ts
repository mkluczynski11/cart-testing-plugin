// The Playwright reporter of a harness run: builds run.json in the run directory from the checkpoint
// attachments. Implements design 8.5 and order N, 6.5: it writes on every test end and again at the end,
// so an exception or a timeout still leaves the file; the first repeat's screenshots go next to it.
import type { FullConfig, Reporter, TestCase, TestError, TestResult } from '@playwright/test/reporter';
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { CheckpointRecord } from './checkpoint';
import type { RepeatRecord, RunMeta, RunRecord } from './classification';
import { loadConfig, packageRoot } from './config';
import { inspectTestFile } from './compiler';
import { sha256 } from './scenario';
import type { FailureRecord } from './shopper';

type Options = { runDir: string; root: string };

function jsonAttachments<T>(result: TestResult, name: string): T[] {
  return result.attachments.filter((a) => a.name === name && a.body).map((a) => JSON.parse((a.body as Buffer).toString('utf8')) as T);
}

function gitSha(cwd: string): string | null {
  const r = spawnSync('git', ['rev-parse', '--short', 'HEAD'], { cwd, encoding: 'utf8' });
  return r.status === 0 ? r.stdout.trim() : null;
}

export default class RunReporter implements Reporter {
  private readonly runDir: string;
  private readonly root: string;
  private readonly record: RunRecord;

  constructor(options: Options) {
    this.runDir = options.runDir;
    this.root = options.root;
    const config = loadConfig(this.root);
    const pkg = JSON.parse(fs.readFileSync(path.join(packageRoot(), 'package.json'), 'utf8')) as { version: string };
    const meta: RunMeta = {
      runId: path.basename(this.runDir), slug: '', scenarioSha256: null, testSha256: null, testOrigin: null,
      timestamp: new Date().toISOString().replace(/\.\d+Z$/, 'Z'), baseURL: config.baseURL, browser: 'chromium',
      locale: config.locale, priceSource: config.priceSource, pluginVersion: pkg.version, gitSha: gitSha(this.root), mode: 'live', defect: null,
    };
    this.record = { meta, verdict: null, repeats: [], errors: [] };
  }

  onBegin(_config: FullConfig): void {
    this.write();
  }

  onTestEnd(test: TestCase, result: TestResult): void {
    const meta = jsonAttachments<{ slug: string; scenarioSha256: string; mode: 'dry' | 'live'; defect: string | null }>(result, 'qa-meta')[0];
    if (meta) Object.assign(this.record.meta, meta);
    if (fs.existsSync(test.location.file)) {
      const text = fs.readFileSync(test.location.file, 'utf8');
      this.record.meta.testSha256 = sha256(text);
      this.record.meta.testOrigin = inspectTestFile(text).untouched ? 'compiled' : 'edited';
    }
    const n = this.record.repeats.length + 1;
    const checkpoints = jsonAttachments<CheckpointRecord>(result, 'checkpoint').map((c) => this.screenshot(c, n));
    const failure = jsonAttachments<FailureRecord & { url?: string | null }>(result, 'qa-failure')[0];
    const last = checkpoints.at(-1)?.displayed;
    const rawTotal = last && 'total' in last && last.total ? last.total.rawText : null;
    const timedOut = result.status === 'timedOut' ? { step: checkpoints.at(-1)?.step ?? null, kind: 'INFRA_FAIL' as const, message: `The test exceeded its time limit of ${test.timeout} ms.`, url: null } : null;
    const error = failure ?? timedOut;
    const repeat: RepeatRecord = {
      n, result: result.status === 'passed' && !checkpoints.some((c) => c.result === 'fail') ? 'pass' : 'fail', status: result.status,
      error: error ? { ...error, rawTotal } : null, checkpoints, durationMs: result.duration,
    };
    this.record.repeats.push(repeat);
    this.write();
  }

  onError(error: TestError): void {
    this.record.errors.push(error.message ?? String(error.value ?? 'unknown error'));
    this.write();
  }

  onEnd(): void {
    this.write();
  }

  /** The first repeat's screenshots sit next to run.json as <step>.png; the others stay among the artifacts. */
  private screenshot(c: CheckpointRecord, n: number): CheckpointRecord {
    if (!c.screenshot || !fs.existsSync(c.screenshot)) return c;
    if (n === 1) {
      fs.copyFileSync(c.screenshot, path.join(this.runDir, `${c.step}.png`));
      return { ...c, screenshot: `${c.step}.png` };
    }
    return { ...c, screenshot: path.relative(this.runDir, c.screenshot) };
  }

  private write(): void {
    fs.mkdirSync(this.runDir, { recursive: true });
    fs.writeFileSync(path.join(this.runDir, 'run.json'), JSON.stringify(this.record, null, 2) + '\n');
  }
}
