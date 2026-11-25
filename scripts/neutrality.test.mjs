// C2, core neutrality (design 14, table of checks): no application name, host, product name, pricing rule id or
// attribute of an example application in skills/, agents/, the template's support/core/ and its unit/ tests.
// The names are read from examples/: the directory names, qa.config.json, the rules files and the recorded runs.
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCANNED = ['skills', 'agents', 'templates/e2e/support/core', 'templates/e2e/unit'];

function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]));
}

/** Names that belong to an example application. */
function exampleNames() {
  const names = new Set();
  for (const app of fs.readdirSync(path.join(root, 'examples'))) {
    const dir = path.join(root, 'examples', app);
    names.add(app);
    const config = path.join(dir, 'qa.config.json');
    if (fs.existsSync(config)) names.add(new URL(JSON.parse(fs.readFileSync(config, 'utf8')).baseURL).hostname.replace(/^www\./, ''));
    for (const f of walk(path.join(dir, 'app')).filter((x) => x.endsWith('.pricing.ts'))) {
      const text = fs.readFileSync(f, 'utf8');
      const rules = text.slice(text.indexOf('export const rules'), text.indexOf('export const constraints'));
      for (const m of rules.matchAll(/id: '([^']+)'/g)) names.add(m[1]);
      for (const m of rules.matchAll(/where: \{ (\w+):/g)) names.add(m[1]);
      for (const m of text.matchAll(/match: \{ name: '([^']+)' \}/g)) names.add(m[1]);
    }
    for (const f of walk(path.join(dir, 'reports')).filter((x) => x.endsWith('run.json'))) {
      for (const r of JSON.parse(fs.readFileSync(f, 'utf8')).repeats ?? []) for (const c of r.checkpoints ?? []) for (const l of c.ledger ?? []) names.add(l.name);
    }
  }
  return [...names].filter((n) => n.length > 3 && !/^Product [A-Z]$/.test(n));  // "Product A" is the harness's own stub name
}

test('skills, agents, support/core and unit/ name no example application, host, product, rule or attribute (C2)', () => {
  const names = exampleNames();
  assert.ok(names.length > 3, `too few example names found: ${names.join(', ')}`);
  const hits = [];
  for (const dir of SCANNED) {
    for (const f of walk(path.join(root, dir)).filter((x) => /\.(ts|md|mjs|json)$/.test(x) && !x.endsWith('MANIFEST.json'))) {
      const text = fs.readFileSync(f, 'utf8').toLowerCase();
      for (const n of names) if (text.includes(n.toLowerCase())) hits.push(`${path.relative(root, f)}: ${n}`);
    }
  }
  assert.deepEqual(hits, []);
});
