// Unit tests of the guards with hook inputs in the shape Claude Code sends (recorded in order D, scripts/fixtures/).
// Covers design 7.2, 7.3 (every row of the write matrix) and R2 (subcommands per role); run with `node --test scripts/`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { decideBash, subcommandsIn } from './guard-bash.mjs';
import { decideWrite } from './guard-paths.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const project = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-guard-'));
const e2e = path.join(project, 'e2e');
fs.mkdirSync(path.join(e2e, 'support', 'harness'), { recursive: true });
fs.writeFileSync(path.join(e2e, 'qa.config.json'), '{}');
fs.writeFileSync(path.join(e2e, 'support', 'harness', 'cli.ts'), '');

/** A recorded input with its project-specific fields replaced by the temporary project. */
function recorded(name, overrides = {}) {
  const input = JSON.parse(fs.readFileSync(path.join(here, 'fixtures', `${name}.json`), 'utf8'));
  return { ...input, cwd: project, ...overrides };
}
const write = (agentType, file, base = 'write-main') =>
  recorded(base, { ...(agentType ? { agent_type: agentType, agent_id: 'a0' } : {}), tool_input: { file_path: file, content: 'x' } });
const bash = (agentType, command) =>
  recorded('bash-main', { ...(agentType ? { agent_type: agentType, agent_id: 'a0' } : {}), tool_input: { command, description: 'd' } });
const env = { CLAUDE_PROJECT_DIR: project };

const allowed = (input) => assert.equal(decideWrite(input, undefined, env), undefined);
const refused = (input, part) => {
  const r = decideWrite(input, undefined, env);
  assert.ok(r, 'expected a refusal');
  if (part) assert.match(r, part);
};

test('recorded inputs carry the fields the guards read', () => {
  for (const name of ['write-main', 'bash-main', 'write-test-verifier', 'bash-test-verifier']) {
    const input = JSON.parse(fs.readFileSync(path.join(here, 'fixtures', `${name}.json`), 'utf8'));
    assert.equal(input.hook_event_name, 'PreToolUse');
    assert.ok(input.tool_input && input.cwd && input.tool_name);
  }
});

test('R4: nobody writes support/core, also the main thread and also by a relative path', () => {
  refused(write(undefined, 'e2e/support/core/money.ts'), /R4/);
  refused(write(undefined, path.join(e2e, 'support/core/ledger.ts')), /R4/);
  refused(write('qa:app-mapper', 'e2e/support/core/money.ts'));
  refused({ ...write(undefined, 'support/core/x.ts'), cwd: e2e }, /R4/);
});

test('main thread: driver, rules, scenario, defects and tests are allowed; reviews and reports are not', () => {
  for (const f of ['e2e/app/shop.driver.ts', 'e2e/app/shop.map.md', 'e2e/app/shop.pricing.ts', 'e2e/specs/s-1.md',
    'e2e/specs/s-1.example.json', 'e2e/specs/s-1.defects.json', 'e2e/tests/s-1.spec.ts', 'README.md', 'src/x.ts']) allowed(write(undefined, f));
  refused(write(undefined, 'e2e/specs/s-1.intent.md'), /test-verifier/);
  refused(write(undefined, 'e2e/reports/s-1/runs/20261125T000000Z-abcd/review.md'));
  refused(write(undefined, 'e2e/reports/s-1/report.md'), /report --promote/);
});

test('an agent that is not this plugin\'s is treated like the main thread', () => {
  allowed(write('general-purpose', 'e2e/tests/s-1.spec.ts'));
  refused(write('Explore', 'e2e/support/core/money.ts'));
});

test('app-mapper writes only the driver and the map', () => {
  allowed(write('qa:app-mapper', 'e2e/app/shop.driver.ts'));
  allowed(write('qa:app-mapper', 'e2e/app/shop.map.md'));
  for (const f of ['e2e/app/shop.pricing.ts', 'e2e/specs/s-1.md', 'e2e/tests/s-1.spec.ts', 'e2e/reports/s-1/report.md', 'notes.md']) {
    refused(write('qa:app-mapper', f), /app-mapper writes only/);
  }
});

test('defect-designer writes only the defects file', () => {
  allowed(write('qa:defect-designer', 'e2e/specs/s-1.defects.json'));
  refused(write('qa:defect-designer', 'e2e/specs/s-1.md'));
  refused(write('qa:defect-designer', 'e2e/tests/s-1.spec.ts'));
});

test('test-verifier writes only the intent review and review.md in a run directory', () => {
  allowed(write('qa:test-verifier', 'e2e/specs/s-1.intent.md', 'write-test-verifier'));
  allowed(write('qa:test-verifier', 'e2e/reports/s-1/runs/20261125T000000Z-abcd/review.md', 'write-test-verifier'));
  refused(write('qa:test-verifier', 'e2e/tests/s-1.spec.ts', 'write-test-verifier'), /fixes nothing/);
  refused(write('qa:test-verifier', 'e2e/reports/s-1/review.md', 'write-test-verifier'));
  refused(write('qa:test-verifier', 'e2e/specs/s-1.md', 'write-test-verifier'));
  refused(recorded('write-test-verifier', { tool_name: 'Edit', tool_input: { file_path: 'e2e/tests/s-1.spec.ts', old_string: 'a', new_string: 'b' } }));
});

test('subcommands are read from qa-harness and npm forms', () => {
  assert.deepEqual(subcommandsIn('qa-harness run s-1 --dry'), ['run']);
  assert.deepEqual(subcommandsIn('qa-harness defects list s-1'), ['defects list']);
  assert.deepEqual(subcommandsIn('cd e2e && npm run qa -- verify s-1'), ['verify']);
  assert.deepEqual(subcommandsIn('/x/bin/qa-harness example s-1 && qa-harness compile s-1'), ['example', 'compile']);
  assert.deepEqual(subcommandsIn('git status'), []);
  assert.deepEqual(subcommandsIn('qa-harness --help'), []);
});

test('main thread: its own subcommands and any other command pass; verify and defects list do not', () => {
  for (const c of ['qa-harness doctor', 'qa-harness example s-1 --confirm', 'qa-harness compile s-1', 'qa-harness run s-1 --dry',
    'qa-harness report s-1 --promote 20261125T000000Z-abcd', 'qa-harness init --app shop --base-url https://x.test', 'qa-harness --help', 'git status', 'ls e2e/specs']) {
    assert.equal(decideBash(bash(undefined, c)), undefined, c);
  }
  assert.match(decideBash(bash(undefined, 'qa-harness verify s-1')), /belongs to qa:test-verifier/);
  assert.match(decideBash(bash(undefined, 'cd e2e && npm run qa -- defects list s-1')), /belongs to qa:defect-designer/);
});

test('agents: one plain call of their own subcommands only', () => {
  assert.equal(decideBash(recorded('bash-test-verifier', { tool_input: { command: 'qa-harness verify s-1' } })), undefined);
  assert.equal(decideBash(bash('qa:test-verifier', 'qa-harness intent s-1 2>&1')), undefined);
  assert.match(decideBash(bash('qa:test-verifier', 'qa-harness compile s-1 --force')), /belongs to main/);
  assert.match(decideBash(bash('qa:test-verifier', 'qa-harness report s-1 --promote r1')), /belongs to main/);
  assert.match(decideBash(bash('qa:test-verifier', 'cat e2e/tests/s-1.spec.ts')), /one plain call/);
  assert.match(decideBash(bash('qa:test-verifier', 'qa-harness verify s-1; rm -rf e2e')), /one plain call/);
  assert.equal(decideBash(bash('qa:app-mapper', 'qa-harness need s-1')), undefined);
  assert.match(decideBash(bash('qa:app-mapper', 'qa-harness run s-1')), /belongs to main/);
  assert.equal(decideBash(bash('qa:defect-designer', 'qa-harness defects check s-1')), undefined);
  assert.match(decideBash(bash('qa:defect-designer', 'echo [] > e2e/specs/s-1.defects.json')), /one plain call/);
});

test('the scripts exit 2 with the reason on stderr, and 0 when allowed', () => {
  const run = (script, input) => spawnSync(process.execPath, [path.join(here, script)], { input: JSON.stringify(input), encoding: 'utf8', env: { ...process.env, ...env } });
  const no = run('guard-paths.mjs', write('qa:test-verifier', 'e2e/tests/s-1.spec.ts', 'write-test-verifier'));
  assert.equal(no.status, 2);
  assert.match(no.stderr, /^Refused for qa:test-verifier: e2e\/tests\/s-1.spec.ts: /);
  assert.equal(run('guard-paths.mjs', write(undefined, 'e2e/tests/s-1.spec.ts')).status, 0);
  const b = run('guard-bash.mjs', bash('qa:app-mapper', 'qa-harness verify s-1'));
  assert.equal(b.status, 2);
  assert.match(b.stderr, /belongs to qa:test-verifier/);
  assert.equal(run('guard-bash.mjs', bash(undefined, 'qa-harness run s-1')).status, 0);
  const broken = spawnSync(process.execPath, [path.join(here, 'guard-bash.mjs')], { input: 'not json', encoding: 'utf8' });
  assert.equal(broken.status, 0);
});
