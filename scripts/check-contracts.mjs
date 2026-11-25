// Fails when the type block quoted in the contracts skill differs from the library's support/core/types.ts.
// Implements order D stage 3 (contracts as the harness implements them) for design 8.3 and 5.3 (`contracts`).
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const pluginRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const DEFAULTS = {
  skill: path.join(pluginRoot, 'skills', 'contracts', 'driver.md'),
  types: path.join(pluginRoot, 'templates', 'e2e', 'support', 'core', 'types.ts'),
};

/** The library file without its leading comment header, lines trimmed at the end. */
export function libraryTypes(text) {
  const lines = text.split('\n');
  while (lines.length && lines[0].startsWith('//')) lines.shift();
  return lines.map((l) => l.trimEnd()).join('\n').trim();
}

/** The fenced block between the types.ts markers of the skill file. */
export function quotedTypes(text) {
  const m = /<!-- types\.ts:begin -->\s*```ts\n([\s\S]*?)\n```\s*<!-- types\.ts:end -->/.exec(text);
  if (!m) return undefined;
  return m[1].split('\n').map((l) => l.trimEnd()).join('\n').trim();
}

/** undefined when they agree, otherwise a sentence naming the first differing line. */
export function compare(skillText, typesText) {
  const quoted = quotedTypes(skillText);
  if (quoted === undefined) return 'The contracts skill has no ```ts block between <!-- types.ts:begin --> and <!-- types.ts:end -->.';
  const lib = libraryTypes(typesText);
  if (quoted === lib) return undefined;
  const a = quoted.split('\n');
  const b = lib.split('\n');
  const i = a.findIndex((l, n) => l !== b[n]);
  const n = i < 0 ? a.length : i;
  return `The quoted types differ from support/core/types.ts at quoted line ${n + 1}: skill has ${JSON.stringify(a[n] ?? '<end>')}, library has ${JSON.stringify(b[n] ?? '<end>')}; copy the library block into the skill again.`;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [skill = DEFAULTS.skill, types = DEFAULTS.types] = process.argv.slice(2);
  const problem = compare(fs.readFileSync(skill, 'utf8'), fs.readFileSync(types, 'utf8'));
  if (problem) {
    console.log(problem);
    process.exit(1);
  }
  console.log(`ok: ${path.relative(process.cwd(), skill)} quotes ${path.relative(process.cwd(), types)} exactly.`);
}
