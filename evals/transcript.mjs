// Tool calls and their results from Claude Code session transcripts, for the graders of evals/run.mjs.
// A transcript may log a tool call a second time after its result (an "api-request-blob" record, report E follow-up):
// a call is recorded only the first time its id appears, so the later entry neither replaces it nor drops its result.
import * as fs from 'node:fs';
import * as path from 'node:path';

/** Calls in the order they first appear: name, input, the text of their result, the transcript file. */
export function callsFrom(files) {
  const calls = new Map();
  for (const f of files) {
    for (const line of fs.readFileSync(f, 'utf8').split('\n')) {
      let o;
      try { o = JSON.parse(line); } catch { continue; }
      const content = Array.isArray(o?.message?.content) ? o.message.content : [];
      for (const part of content) {
        if (part.type === 'tool_use' && !calls.has(part.id)) calls.set(part.id, { name: part.name, input: part.input, result: '', file: path.basename(f) });
        if (part.type === 'tool_result' && calls.has(part.tool_use_id)) {
          const text = Array.isArray(part.content) ? part.content.map((x) => x.text ?? '').join('\n') : String(part.content ?? '');
          calls.get(part.tool_use_id).result = text;
        }
      }
    }
  }
  return [...calls.values()];
}
