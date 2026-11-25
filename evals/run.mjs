// Runs level A cases as headless Claude Code sessions with this plugin, in prepared scratch repos under .sandbox/evals/.
// Implements design 14.1 for the cases `claude plugin eval` cannot run (its sandbox has no plugin bin/ on PATH; order D stage 1).
import { spawn, spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CASES } from './cases.mjs';

const pluginRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sandbox = path.join(pluginRoot, '.sandbox', 'evals');
const base = path.join(pluginRoot, '.sandbox', 'eval-base');
const qa = path.join(pluginRoot, 'bin', 'qa-harness');

const sh = (cmd, args, cwd) => {
  const r = spawnSync(cmd, args, { cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0) throw new Error(`${cmd} ${args.join(' ')} failed in ${cwd}: ${(r.stdout + r.stderr).trim().split('\n').slice(-5).join(' | ')}`);
  return r.stdout;
};

/** A tester repo after `/qa:setup` with the starter pack and an unreachable application address, committed. */
function ensureBase() {
  if (fs.existsSync(path.join(base, 'e2e', 'node_modules'))) return;
  fs.rmSync(base, { recursive: true, force: true });
  fs.mkdirSync(base, { recursive: true });
  sh('git', ['init', '-q'], base);
  sh(qa, ['init', '--app', 'toolshop', '--base-url', 'http://127.0.0.1:9'], base);
  sh('git', ['add', '-A'], base);
  sh('git', ['-c', 'user.name=eval', '-c', 'user.email=eval@example.invalid', 'commit', '-qm', 'setup'], base);
}

/** A fresh copy of the base repo for one case, with the case's own fixture committed on top. */
function prepare(c) {
  const repo = path.join(sandbox, `${c.id}-${Date.now().toString(36)}`);
  fs.mkdirSync(sandbox, { recursive: true });
  sh('cp', ['-cR', base, repo], pluginRoot);
  const ctx = { repo, e2e: path.join(repo, 'e2e'), qa: (...a) => sh(qa, a, repo) };
  if (c.setup) {
    c.setup(ctx);
    sh('git', ['add', '-A'], repo);
    sh('git', ['-c', 'user.name=eval', '-c', 'user.email=eval@example.invalid', 'commit', '-qm', `fixture ${c.id}`, '--allow-empty'], repo);
  }
  return ctx;
}

/** Tool calls and their results from the session transcript and its subagents' transcripts. */
function transcript(sessionId) {
  const projects = path.join(os.homedir(), '.claude', 'projects');
  const files = [];
  for (const p of fs.existsSync(projects) ? fs.readdirSync(projects) : []) {
    const main = path.join(projects, p, `${sessionId}.jsonl`);
    if (fs.existsSync(main)) files.push(main);
    const sub = path.join(projects, p, sessionId, 'subagents');
    if (fs.existsSync(sub)) for (const f of fs.readdirSync(sub)) if (f.endsWith('.jsonl')) files.push(path.join(sub, f));
  }
  const calls = new Map();
  for (const f of files) {
    for (const line of fs.readFileSync(f, 'utf8').split('\n')) {
      let o;
      try { o = JSON.parse(line); } catch { continue; }
      const content = Array.isArray(o?.message?.content) ? o.message.content : [];
      for (const part of content) {
        if (part.type === 'tool_use') calls.set(part.id, { name: part.name, input: part.input, result: '', file: path.basename(f) });
        if (part.type === 'tool_result' && calls.has(part.tool_use_id)) {
          const text = Array.isArray(part.content) ? part.content.map((x) => x.text ?? '').join('\n') : String(part.content ?? '');
          calls.get(part.tool_use_id).result = text;
        }
      }
    }
  }
  return [...calls.values()];
}

function runSession(c, ctx) {
  return new Promise((resolve) => {
    const args = ['-p', c.prompt, '--plugin-dir', pluginRoot, '--permission-mode', 'auto', '--max-turns', String(c.maxTurns ?? 30),
      '--output-format', 'json', '--model', c.model ?? 'sonnet'];
    const started = Date.now();
    const child = spawn('claude', args, { cwd: ctx.repo, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (err += d));
    const timer = setTimeout(() => child.kill('SIGTERM'), (c.timeoutSec ?? 900) * 1000);
    child.on('close', (code) => {
      clearTimeout(timer);
      let json;
      try { json = JSON.parse(out); } catch { json = { result: out.slice(-2000), is_error: true, stderr: err.slice(-2000) }; }
      resolve({ code, json, seconds: Math.round((Date.now() - started) / 1000) });
    });
  });
}

async function runCase(c) {
  const ctx = prepare(c);
  const { code, json, seconds } = await runSession(c, ctx);
  const calls = json.session_id ? transcript(json.session_id) : [];
  const facts = { ...ctx, json, calls, answer: String(json.result ?? '') };
  const checks = c.checks.map(([what, fn]) => {
    try { const r = fn(facts); return { what, ok: r === true, note: r === true ? '' : String(r) }; } catch (e) { return { what, ok: false, note: e.message }; }
  });
  const result = {
    case: c.id, title: c.title, ok: checks.every((x) => x.ok), exit: code, turns: json.num_turns, costUsd: json.total_cost_usd,
    seconds, subagents: json.subagent_stats?.by_type ?? {}, terminal: json.terminal_reason, session: json.session_id, repo: path.relative(pluginRoot, ctx.repo),
    checks, answer: facts.answer.slice(-1500),
  };
  fs.appendFileSync(path.join(sandbox, 'results.jsonl'), JSON.stringify(result) + '\n');
  return result;
}

const argv = process.argv.slice(2);
const jobsAt = argv.indexOf('--jobs');
const jobs = jobsAt >= 0 ? Number(argv.splice(jobsAt, 2)[1]) : 1;
const wanted = argv.length ? CASES.filter((c) => argv.includes(c.id)) : CASES;
if (!wanted.length) {
  console.log(`No such case; known: ${CASES.map((c) => c.id).join(', ')}.`);
  process.exit(1);
}
ensureBase();
const queue = [...wanted];
const done = [];
await Promise.all(Array.from({ length: Math.max(1, jobs) }, async () => {
  while (queue.length) {
    const c = queue.shift();
    const r = await runCase(c);
    done.push(r);
    console.log(`${r.ok ? 'PASS' : 'FAIL'} ${r.case} · turns ${r.turns} · $${r.costUsd?.toFixed(2)} · ${r.seconds}s · subagents ${JSON.stringify(r.subagents)} · ${r.repo}`);
    for (const x of r.checks) console.log(`   ${x.ok ? 'ok  ' : 'FAIL'} ${x.what}${x.note ? `: ${x.note}` : ''}`);
  }
}));
process.exit(done.every((r) => r.ok) ? 0 : 1);
