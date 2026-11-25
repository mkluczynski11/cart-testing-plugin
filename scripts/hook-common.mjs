// Shared pieces of the PreToolUse guards: the hook input, the role, the e2e root of a path and the matrix.
// Implements design 7.2 (agent_type decides the role; no agent_type is the main thread) and order D note 6.
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const pluginRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** The one data file both guards read (design 7.3 and 6.1). */
export function loadMatrix(file = path.join(pluginRoot, 'hooks', 'matrix.json')) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

/** The role a hook input belongs to: a plugin agent's agent_type, otherwise "main". */
export function roleOf(input, matrix) {
  const t = input.agent_type;
  return typeof t === 'string' && matrix.writes[t] ? t : 'main';
}

/** An e2e root holds qa.config.json and the harness entry point. */
const isRoot = (dir) =>
  fs.existsSync(path.join(dir, 'qa.config.json')) && fs.existsSync(path.join(dir, 'support', 'harness', 'cli.ts'));

/**
 * Where a file lies: its path relative to the e2e root that contains it, or undefined outside every e2e root.
 * Relative paths are resolved against the hook's cwd, then the project directory.
 */
export function locate(filePath, input, env = process.env) {
  const base = input.cwd || env.CLAUDE_PROJECT_DIR || process.cwd();
  const abs = path.resolve(base, filePath);
  for (let dir = path.dirname(abs); ; dir = path.dirname(dir)) {
    if (isRoot(dir)) return { abs, root: dir, rel: path.relative(dir, abs).split(path.sep).join('/') };
    if (path.dirname(dir) === dir) return { abs, root: undefined, rel: undefined };
  }
}

/** A path pattern of the matrix as a regular expression: '**' crosses directories, '*' does not. */
export function globToRegExp(glob) {
  let re = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*' && glob[i + 1] === '*') { re += '.*'; i++; }
    else if (c === '*') re += '[^/]*';
    else re += c.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${re}$`);
}

export const matches = (glob, rel) => globToRegExp(glob).test(rel);

/** Read the hook input from stdin. */
export async function readInput() {
  let raw = '';
  for await (const chunk of process.stdin) raw += chunk;
  return JSON.parse(raw);
}

/** Refuse the tool call: exit code 2, and stderr is the reason the model reads (design 7.2). */
export function refuse(sentence) {
  process.stderr.write(`${sentence}\n`);
  process.exit(2);
}
