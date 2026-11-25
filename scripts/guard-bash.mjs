// PreToolUse guard for Bash: a plugin agent may run only qa-harness with its own subcommands; nobody runs another role's.
// Implements design 7.2 (guard-bash), R2 and the "Who invokes it" column of 6.1.
import { loadMatrix, readInput, refuse, roleOf } from './hook-common.mjs';
import { pathToFileURL } from 'node:url';

/** Every harness invocation in a command line: `qa-harness <sub>` or `npm run qa -- <sub>`, with "defects list|check"; a flag such as --help is not one. */
export function subcommandsIn(command) {
  const found = [];
  const re = /(?:^|[\s;&|(`])(?:\S*\/)?qa-harness\s+([a-z][a-z-]*)(?:\s+(list|check)\b)?|npm\s+(?:--prefix\s+\S+\s+)?run\s+qa(?:\s+--silent)?\s+--\s+([a-z][a-z-]*)(?:\s+(list|check)\b)?/g;
  for (const m of command.matchAll(re)) {
    const sub = m[1] ?? m[3];
    const extra = m[2] ?? m[4];
    found.push(sub === 'defects' && extra ? `defects ${extra}` : sub);
  }
  return found;
}

/** A single plain qa-harness call: no chaining, pipes, redirections or substitutions (an optional trailing 2>&1). */
const SINGLE_CALL = /^\s*qa-harness\s+[^;&|<>`$()\n]*?(?:\s+2>&1)?\s*$/;

/** The decision for one Bash call: undefined when allowed, otherwise the sentence the model gets. */
export function decideBash(input, matrix = loadMatrix()) {
  const command = input.tool_input?.command;
  if (typeof command !== 'string') return undefined;
  const role = roleOf(input, matrix);
  const own = matrix.subcommands[role];
  const subs = subcommandsIn(command);
  if (role !== 'main' && (!SINGLE_CALL.test(command) || subs.length !== 1)) {
    return `Refused for ${role}: through Bash it may run only one plain call of qa-harness ${own.join(' | ')}; read files with Read, Grep or Glob.`;
  }
  const foreign = subs.find((s) => !own.includes(s));
  if (foreign) {
    const owners = Object.entries(matrix.subcommands).filter(([, list]) => list.includes(foreign)).map(([r]) => r).join(', ') || 'nobody';
    return `Refused for ${role}: qa-harness ${foreign} belongs to ${owners} (design 6.1); this role may run ${own.join(' | ')}.`;
  }
  return undefined;
}

const isMain = import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  let input;
  try {
    input = await readInput();
  } catch {
    process.exit(0); // not a hook input this guard understands; it guards nothing then
  }
  const reason = decideBash(input);
  if (reason) refuse(reason);
}
