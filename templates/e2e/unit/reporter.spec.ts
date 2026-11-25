// Unit test of support/core/reporter.ts (report V N3): run.json says whether the tree that ran was committed.
import { expect, test } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { packageRoot } from '../support/core/config';
import { gitState } from '../support/core/reporter';

test('the git state of a run records a dirty tree next to the commit', () => {
  const dir = path.join(packageRoot(), 'reports', 'selftest', 'runs', 'unit-git');
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const git = (...args: string[]) => execFileSync('git', ['-c', 'user.email=unit@example.invalid', '-c', 'user.name=unit', ...args], { cwd: dir });
  git('init', '-q');
  fs.writeFileSync(path.join(dir, 'driver.ts'), 'one\n');
  git('add', '-A');
  git('commit', '-q', '-m', 'one');
  fs.writeFileSync(path.join(dir, 'driver.ts'), 'two\n');
  expect(gitState(dir).dirty).toBe(true);
});
