// qa-harness init: installs the e2e/ template into the tester's repo, writes qa.config.json, installs dependencies, runs selftest.
// Implements design 5.3 (setup steps 2-5), 8.6 (configuration) and order D notes 10-11 (exclusion list, starter pack).
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const pluginRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const template = path.join(pluginRoot, 'templates', 'e2e');

/** Never copied from the template: what a development checkout has and an installed plugin does not. */
const EXCLUDED_DIRS = new Set(['node_modules', 'test-results', 'playwright-report', '.git']);
const EXCLUDED_FILES = new Set(['.lock', 'attempts.json', '.DS_Store']);
const isExcluded = (rel) => {
  const parts = rel.split(path.sep);
  if (parts.some((p) => EXCLUDED_DIRS.has(p) || p.startsWith('.promote-'))) return true;
  if (parts[0] === 'reports' && (parts[2] === 'runs' || parts.includes('html'))) return true;
  return EXCLUDED_FILES.has(parts[parts.length - 1]);
};
/** The tester's work: an existing file here is never overwritten. */
const PROTECTED = ['app', 'specs', 'tests', 'reports'];
const isProtected = (rel) => PROTECTED.includes(rel.split(path.sep)[0]);
/** Scripts of the template that point into the plugin repo and mean nothing in a tester's repo. */
const DEV_SCRIPTS = ['qa:toolshop', 'typecheck:toolshop'];

const lines = [];
function finish(verdict) {
  for (const l of lines.slice(-14)) console.log(l);
  console.log(`VERDICT: ${verdict}`);
  process.exit(verdict === 'PASS' ? 0 : 1);
}
function fail(sentence, verdict = 'INFRA_FAIL') {
  lines.push(sentence);
  finish(verdict);
}

function parseArgs(argv) {
  const known = { '--app': 'app', '--base-url': 'baseURL', '--test-id-attribute': 'testIdAttribute', '--locale': 'locale', '--currency': 'currency', '--defects': 'defects' };
  const out = {};
  for (let i = 0; i < argv.length; i += 2) {
    const key = known[argv[i]];
    if (!key || argv[i + 1] === undefined) fail(`Unknown or incomplete option "${argv[i]}"; usage: qa-harness init --app <name> --base-url <url> [--test-id-attribute <a>] [--locale <l>] [--currency <c>] [--defects default|extended].`, 'SPEC_INVALID');
    out[key] = argv[i + 1];
  }
  if (!out.app || !/^[a-z0-9][a-z0-9-]*$/.test(out.app)) fail('--app needs a lowercase name such as "my-shop"; it names app/<app>.driver.ts and app/<app>.pricing.ts.', 'SPEC_INVALID');
  try {
    const u = new URL(out.baseURL ?? '');
    if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Error();
    out.baseURL = u.origin + (u.pathname === '/' ? '' : u.pathname.replace(/\/$/, ''));
  } catch {
    fail('--base-url needs the address of the application, such as https://shop.example.com.', 'SPEC_INVALID');
  }
  if (out.defects && !['default', 'extended'].includes(out.defects)) fail('--defects takes default or extended.', 'SPEC_INVALID');
  if (out.currency && !['USD', 'EUR'].includes(out.currency)) fail(`--currency ${out.currency} is not supported by the amount parser; use USD or EUR.`, 'SPEC_INVALID');
  return out;
}

/** The tester's repo: the git top level of the working directory, else the working directory. */
function repoRoot() {
  const r = spawnSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' });
  return r.status === 0 ? r.stdout.trim() : process.cwd();
}

/** Copy src into dst; returns counts. Excluded paths are skipped, protected existing files are kept. */
function copyTree(src, dst, relBase = '') {
  const counts = { copied: 0, kept: 0 };
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const rel = path.join(relBase, entry.name);
    if (isExcluded(rel)) continue;
    const from = path.join(src, entry.name);
    const to = path.join(dst, entry.name);
    if (entry.isDirectory()) {
      fs.mkdirSync(to, { recursive: true });
      const c = copyTree(from, to, rel);
      counts.copied += c.copied;
      counts.kept += c.kept;
    } else if (entry.isFile()) {
      if (fs.existsSync(to) && isProtected(rel)) { counts.kept += 1; continue; }
      if (rel === 'package.json') {
        const pkg = JSON.parse(fs.readFileSync(from, 'utf8'));
        for (const s of DEV_SCRIPTS) delete pkg.scripts?.[s];
        fs.writeFileSync(to, JSON.stringify(pkg, null, 2) + '\n');
      } else fs.copyFileSync(from, to);
      counts.copied += 1;
    }
  }
  return counts;
}

function run(cmd, args, cwd) {
  const r = spawnSync(cmd, args, { cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  return { ok: r.status === 0, out: `${r.stdout ?? ''}${r.stderr ?? ''}`.trim().split('\n') };
}

const opts = parseArgs(process.argv.slice(2));
if (!fs.existsSync(path.join(template, 'support', 'harness', 'cli.ts'))) fail(`The plugin has no e2e template at ${template}; reinstall the plugin.`);

const repo = repoRoot();
const e2e = path.join(repo, 'e2e');
const existed = fs.existsSync(e2e);
fs.mkdirSync(e2e, { recursive: true });
const counts = copyTree(template, e2e);
lines.push(`${existed ? 'Updated' : 'Created'} ${path.relative(process.cwd(), e2e) || 'e2e'}/: ${counts.copied} file(s) from the plugin's template, ${counts.kept} of your file(s) kept.`);

// Starter pack (order D, stage 2): a ready driver and rules file for an application the plugin already knows.
const pack = path.join(pluginRoot, 'examples', opts.app);
let packConfig = {};
if (fs.existsSync(path.join(pack, 'app'))) {
  const c = copyTree(path.join(pack, 'app'), path.join(e2e, 'app'), 'app');
  lines.push(`Starter pack for "${opts.app}": ${c.copied} file(s) copied into e2e/app/, ${c.kept} existing kept.`);
  // The record report.md reads to say where the driver came from (order G): the sha256 of every installed pack file.
  const sha = (f) => createHash('sha256').update(fs.readFileSync(f)).digest('hex');
  const installed = Object.fromEntries(fs.readdirSync(path.join(pack, 'app'))
    .filter((f) => f !== 'starter-pack.json' && fs.existsSync(path.join(e2e, 'app', f)) && sha(path.join(pack, 'app', f)) === sha(path.join(e2e, 'app', f)))
    .map((f) => [f, sha(path.join(e2e, 'app', f))]));
  fs.writeFileSync(path.join(e2e, 'app', 'starter-pack.json'), JSON.stringify({ app: opts.app, files: installed }, null, 2) + '\n');
  if (fs.existsSync(path.join(pack, 'qa.config.json'))) packConfig = JSON.parse(fs.readFileSync(path.join(pack, 'qa.config.json'), 'utf8'));
} else {
  lines.push(`The plugin has no starter pack for "${opts.app}"; app-mapper builds the driver from the page on the first scenario.`);
}

// qa.config.json: template defaults < starter pack < the existing config < the arguments of this call.
const configFile = path.join(e2e, 'qa.config.json');
const templateConfig = JSON.parse(fs.readFileSync(path.join(template, 'qa.config.json'), 'utf8'));
const existing = existed && fs.existsSync(configFile) ? JSON.parse(fs.readFileSync(configFile, 'utf8')) : {};
const { baseURL: _b, app: _a, ...packDefaults } = packConfig;
const config = { ...templateConfig, ...packDefaults, ...existing, ...opts };
fs.writeFileSync(configFile, JSON.stringify(config, null, 2) + '\n');
lines.push(`Wrote e2e/qa.config.json: app ${config.app}, baseURL ${config.baseURL}, test id attribute ${config.testIdAttribute}, ${config.locale}, ${config.currency}, defects ${config.defects}.`);

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const ci = run(npm, ['ci', '--no-audit', '--no-fund'], e2e);
if (!ci.ok) fail(`npm ci in e2e/ failed: ${ci.out.slice(-3).join(' | ')}`);
lines.push(`Installed e2e/ dependencies: ${ci.out.filter(Boolean).pop()}`);

const bin = (name) => path.join(e2e, 'node_modules', '.bin', process.platform === 'win32' ? `${name}.cmd` : name);
const chromium = run(bin('playwright'), ['install', 'chromium'], e2e);
if (!chromium.ok) fail(`Installing Chromium failed: ${chromium.out.slice(-3).join(' | ')}`);
lines.push('Chromium for Playwright is installed.');

const selftest = run(bin('tsx'), [path.join('support', 'harness', 'cli.ts'), 'selftest'], e2e);
const verdictLine = selftest.out.find((l) => l.startsWith('VERDICT: ')) ?? 'VERDICT: INFRA_FAIL';
lines.push(`selftest: ${selftest.out.filter((l) => !l.startsWith('VERDICT: ')).slice(-2).join(' ')}`);
if (!selftest.ok) fail('The harness selftest failed in e2e/; rerun "npm run qa -- selftest" there and report the output as a harness bug.');
lines.push('Setup is complete: e2e/ works without the plugin through "npm run qa -- <subcommand>" in e2e/. Commit e2e/ (its .gitignore keeps run directories out).');
finish(verdictLine.slice('VERDICT: '.length));
