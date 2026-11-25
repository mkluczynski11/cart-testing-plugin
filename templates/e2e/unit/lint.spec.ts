// Unit tests of support/harness/lint.ts: the static gate G0 (design 7.4, order N 6.3), both ways.
import { expect, test } from '@playwright/test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { lintDriver, lintTest, testCheckpoints } from '../support/harness/lint';

const golden = fs.readFileSync(path.join(__dirname, '..', 'support', 'harness', 'fixtures', 'golden', 'reference.spec.txt'), 'utf8');
const rules = (text: string) => lintTest('t.spec.ts', text).map((v) => v.rule);
const driver = (body: string) => lintDriver('app/x.driver.ts', `import type { Page } from '@playwright/test';\n${body}\n`, 'https://shop.example.com').map((v) => v.rule);

test('a compiled test has no forbidden pattern', () => expect(rules(golden)).toEqual([]));
test('expect in a test is forbidden', () => expect(rules(golden.replace("await shopper.checkTotal('S1');", "await shopper.checkTotal('S1');\n  expect(1).toBe(1);")).join()).toContain('forbidden identifier expect'));
test('an if around an action is forbidden', () => expect(rules(golden.replace("  await shopper.checkTotal('S2');", "  if (b) await shopper.checkTotal('S2');")).join()).toContain('control flow'));
test('an amount literal in a test is forbidden', () => expect(rules(golden.replace("checkTotal('S1')", "checkTotal('$17.25')")).join()).toContain('reads as an amount'));
test('test.only is forbidden', () => expect(rules(golden.replace("test('reference'", "test.only('reference'")).length).toBeGreaterThan(0));
test('an amount in the test title is allowed', () => expect(rules(golden.replace("test('reference'", "test('discount from 50,00 €'"))).toEqual([]));
test('the checkpoints of a test are read from its calls', () => expect(testCheckpoints(golden)).toEqual(['S1', 'S2', 'S3', 'S4']));
test('waitForTimeout in a driver is forbidden', () => expect(driver('async function f(page: Page) { await page.waitForTimeout(500); }').join()).toContain('waitForTimeout'));
test('page.request in a driver is forbidden', () => expect(driver('async function f(page: Page) { await page.request.get("/api"); }').join()).toContain('page.request'));
test('an XPath locator in a driver is forbidden', () => expect(driver('function f(page: Page) { return page.locator("//div"); }').join()).toContain('XPath'));
test('a CSS-class locator needs the exception marker', () => expect(driver('function f(page: Page) { return page.locator(".active"); }').join()).toContain('locator-exception'));
test('a CSS-class locator with the marker is allowed', () => expect(driver('function f(page: Page) { return page.locator(".active"); } // locator-exception: only the class marks it')).toEqual([]));
test('goto outside the application is forbidden', () => expect(driver('async function f(page: Page) { await page.goto("https://evil.example.org/"); }').length).toBeGreaterThan(0));
test('an import from outside support/core is forbidden', () => expect(driver("import { x } from '../../elsewhere';").join()).toContain('outside support/core'));
