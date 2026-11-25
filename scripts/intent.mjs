// qa-harness intent <slug>: is there an intent review for the scenario as confirmed? Prints the confirmed hash to copy.
// Implements order D note 3 (compile only after INTENT_OK for the current scenario hash) and design 10.7 (review bound to the hash).
import * as fs from 'node:fs';
import * as path from 'node:path';

const [root, slug] = process.argv.slice(2);
const lines = [];
function finish(verdict) {
  for (const l of lines) console.log(l);
  console.log(`VERDICT: ${verdict}`);
  process.exit(verdict === 'PASS' ? 0 : 1);
}
if (!slug || !/^[a-z0-9][a-z0-9-]*$/.test(slug)) {
  lines.push('usage: qa-harness intent <slug>');
  finish('SPEC_INVALID');
}
const example = path.join(root, 'specs', `${slug}.example.json`);
const confirmed = fs.existsSync(example) ? JSON.parse(fs.readFileSync(example, 'utf8')).confirmed : undefined;
if (!confirmed?.scenarioSha256) {
  lines.push(`Scenario ${slug} is not confirmed (no confirmed hash in specs/${slug}.example.json); the intent review comes after qa-harness example ${slug} --confirm.`);
  lines.push('state: not-confirmed');
  finish('SPEC_INVALID');
}
lines.push(`Scenario ${slug} is confirmed; scenario_sha256: ${confirmed.scenarioSha256}`);
const review = path.join(root, 'specs', `${slug}.intent.md`);
if (!fs.existsSync(review)) {
  lines.push(`specs/${slug}.intent.md does not exist; the test-verifier agent writes it (step 3a).`);
  lines.push('state: missing');
  finish('SPEC_INVALID');
}
const text = fs.readFileSync(review, 'utf8');
const hash = /^scenario_sha256:\s*([0-9a-f]{64})\s*$/m.exec(text)?.[1];
const verdict = /^verdict:\s*([A-Z_]+)\s*$/m.exec(text)?.[1];
if (!hash || !verdict) {
  lines.push(`specs/${slug}.intent.md has no "scenario_sha256: <64 hex>" or no "verdict: <VERDICT>" line in its front matter; it must be written again.`);
  lines.push('state: unreadable');
  finish('SPEC_INVALID');
}
if (hash !== confirmed.scenarioSha256) {
  lines.push(`specs/${slug}.intent.md reviews scenario ${hash.slice(0, 12)}…, but the confirmed scenario is ${confirmed.scenarioSha256.slice(0, 12)}…; the review is stale.`);
  lines.push('state: stale');
  finish('SPEC_INVALID');
}
lines.push(`specs/${slug}.intent.md reviews the confirmed scenario; its verdict is ${verdict}.`);
lines.push(`state: current ${verdict}`);
finish(verdict === 'INTENT_OK' ? 'PASS' : 'SPEC_INVALID');
