// qa-harness example <slug> [--confirm]: validate, compute the stubs and the example table, and freeze.
// Implements design 8.1 (freeze), 8.2 (example) and 11.1 (what the tester confirms). Without --confirm a confirmed
// scenario keeps its example.json and the confirmation record in it (follow-up to order G).
import * as fs from 'node:fs';
import { files } from '../core/config';
import { buildExample, type ExampleFile } from '../core/example';
import { formatMoney, fromDecimal } from '../core/money';
import { describeRule, describeSources } from '../core/pricing';
import { freezeMessage, parseScenarioText, scenarioHash, setStatusLine } from '../core/scenario';
import { loadScenario, rel, type CommandResult } from './common';

export function example(root: string, slug: string, confirm: boolean): CommandResult {
  const got = loadScenario(root, slug);
  if (!got.ok) return got.result;
  const { scenario: s, pricing, fmt, rulesSha256 } = got.loaded;
  const ex: ExampleFile = buildExample(s, pricing, fmt);
  const money = (d: string) => formatMoney(fromDecimal(d, fmt.currency), fmt);
  const lines = [
    `Example for ${s.id} on stub products, not the application's: ${s.aliases.map((a) => [`${a} = ${ex.stub[a].name}`, money(ex.stub[a].price), ...Object.entries(ex.stub[a].attrs).map(([k, v]) => `${k} ${v}`)].join(', ')).join('; ')}.`,
    ...ex.expected.map((r) => `${r.step.padEnd(4)} ${r.action.padEnd(14)} ${r.cart.padEnd(16)} ${r.checkpoint ? money(r.total) : '(no checkpoint)'}${Object.keys(r.adjustments).length ? ` after ${Object.entries(r.adjustments).map(([k, v]) => `${k} ${money(v)}`).join(', ')}` : ''}`),
    ...(pricing.rules.length
      ? [`Rules: ${pricing.rules.map((r, i) => describeRule(r, i, money)).join('; ')}.`, `Source: ${describeSources(pricing.rules)}.`]
      : ['No pricing rules apply.']),
    ...ex.gaps.map((g) => `Scenario gap: ${g}.`),
  ];
  const { freeze, example: stored } = got.loaded;
  if (!confirm && freeze !== 'not-confirmed' && stored?.confirmed) {
    // A confirmed scenario: the file holds the confirmation record (8.1), so it is printed, never rewritten here.
    lines.push(freezeMessage(freeze, slug), `Left ${rel(root, files.example(root, slug))} as it is: it holds the confirmation record (scenario sha256 ${stored.confirmed.scenarioSha256.slice(0, 12)}…).`);
    return { verdict: 'PASS', lines, data: { example: ex } };
  }
  if (confirm) {
    const newText = setStatusLine(got.loaded.text, 'confirmed');
    const newData = parseScenarioText(newText).data;
    if (scenarioHash(newData) !== got.loaded.scenarioSha256) throw new Error('the confirmation changed more than the status line');
    ex.confirmed = { scenarioSha256: got.loaded.scenarioSha256, rulesSha256 };
    fs.writeFileSync(files.scenario(root, slug), newText);
    lines.push(`Confirmed: status set to confirmed; scenario sha256 ${ex.confirmed.scenarioSha256.slice(0, 12)}…, rules sha256 ${rulesSha256.slice(0, 12)}….`);
  } else {
    lines.push(`Show this to the tester; after the approval run qa-harness example ${slug} --confirm.`);
  }
  fs.writeFileSync(files.example(root, slug), JSON.stringify(ex, null, 2) + '\n');
  lines.push(`Wrote ${rel(root, files.example(root, slug))}.`);
  return { verdict: 'PASS', lines, data: { example: ex } };
}
