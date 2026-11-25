// Starts the Playwright MCP server for app-mapper with the tester's application settings from e2e/qa.config.json.
// Implements design 4.2 (the one browser, app-mapper's), R11 (--allowed-origins) and 15.4 (passing origin and test id to a static .mcp.json).
import { spawn } from 'node:child_process';
import * as fs from 'node:fs';
import { createRequire } from 'node:module';
import * as os from 'node:os';
import * as path from 'node:path';

/** The server version is pinned: a new release must not change what app-mapper sees between two runs. */
const SERVER = '@playwright/mcp@0.0.86';

const project = path.resolve(process.argv[2] || process.cwd());
const isRoot = (dir) => fs.existsSync(path.join(dir, 'qa.config.json')) && fs.existsSync(path.join(dir, 'support', 'harness', 'cli.ts'));
const root = [path.join(project, 'e2e'), project].find(isRoot);
if (!root) {
  process.stderr.write('qa browser: no e2e/ in this project yet, so there is no application to open; run /qa:setup first.\n');
  process.exit(1);
}

const config = JSON.parse(fs.readFileSync(path.join(root, 'qa.config.json'), 'utf8'));
const origins = new Set([new URL(config.baseURL).origin, ...(config.browserAllowedOrigins ?? [])]);
const args = ['-y', SERVER, '--headless', '--isolated', '--browser', 'chromium',
  '--test-id-attribute', config.testIdAttribute ?? 'data-testid',
  '--allowed-origins', [...origins].join(';'),
  '--output-dir', path.join(os.tmpdir(), 'qa-browser', path.basename(project))];
try {
  // The Chromium that /qa:setup installed for the harness; the server's own default would be Google Chrome.
  const { chromium } = createRequire(path.join(root, 'package.json'))('@playwright/test');
  args.push('--executable-path', chromium.executablePath());
} catch {
  process.stderr.write('qa browser: e2e/ has no installed @playwright/test; the server uses its default browser. Run /qa:setup again to fix it.\n');
}

const child = spawn(process.platform === 'win32' ? 'npx.cmd' : 'npx', args, { stdio: 'inherit' });
child.on('exit', (code) => process.exit(code ?? 1));
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
