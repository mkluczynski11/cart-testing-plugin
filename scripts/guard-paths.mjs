// PreToolUse guard for Write, Edit and NotebookEdit: compares the target path with the write matrix for the caller's role.
// Implements design 7.2 (guard-paths), 7.3 (write matrix), R1 and R4.
import { loadMatrix, locate, matches, readInput, refuse, roleOf } from './hook-common.mjs';
import { pathToFileURL } from 'node:url';

/** The decision for one write: undefined when allowed, otherwise the sentence the model gets. */
export function decideWrite(input, matrix = loadMatrix(), env = process.env) {
  const file = input.tool_input?.file_path ?? input.tool_input?.notebook_path;
  if (typeof file !== 'string' || !file) return undefined;
  const role = roleOf(input, matrix);
  const rules = matrix.writes[role];
  const where = locate(file, input, env);
  const shown = where.rel ? `e2e/${where.rel}` : file;
  if (role === 'main') {
    if (!where.rel) return undefined;
    const hit = rules.deny.find((r) => matches(r.path, where.rel));
    return hit ? `Refused: ${shown}: ${hit.reason}` : undefined;
  }
  if (where.rel && rules.allow.some((p) => matches(p, where.rel))) return undefined;
  return `Refused for ${role}: ${shown}: ${rules.reason}`;
}

const isMain = import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  let input;
  try {
    input = await readInput();
  } catch {
    process.exit(0); // not a hook input this guard understands; it guards nothing then
  }
  const reason = decideWrite(input);
  if (reason) refuse(reason);
}
