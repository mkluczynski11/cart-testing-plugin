// Gate G0, static: forbidden patterns in the compiled test and in the drivers, found on a real syntax tree.
// Implements design 7.4 and R8/R13 with the rules of order N, section 6.3. Parser: @babel/parser, because
// TypeScript 7 exposes no createSourceFile.
import { parse } from '@babel/parser';
import * as fs from 'node:fs';
import * as path from 'node:path';

/** The few node fields the rules read; every other field is walked generically. */
type Node = { type: string; loc?: { start: { line: number } }; [key: string]: unknown };

export type LintViolation = { file: string; line: number; rule: string };

const AMOUNT_TEXT = /[$€£]\s*\d|\d\s*[$€£]|^\s*-?\d{1,3}(?:[.,]\d{3})*[.,]\d{2}\s*$/;
const SHOPPER_CALLS = new Set(['add', 'setQuantity', 'remove', 'checkTotal']);

function parseFile(text: string): Node {
  return parse(text, { sourceType: 'module', plugins: ['typescript'], errorRecovery: false }) as unknown as Node;
}

const isNode = (v: unknown): v is Node => typeof v === 'object' && v !== null && typeof (v as Node).type === 'string';

/** Visit every node below `node`, depth first. */
function walk(node: Node, visit: (n: Node) => void): void {
  visit(node);
  for (const [key, value] of Object.entries(node)) {
    if (key === 'loc' || key === 'leadingComments' || key === 'trailingComments' || key === 'innerComments') continue;
    if (Array.isArray(value)) for (const v of value) { if (isNode(v)) walk(v, visit); }
    else if (isNode(value)) walk(value, visit);
  }
}

const lineOf = (n: Node) => n.loc?.start.line ?? 0;
const child = (n: Node, key: string) => n[key] as Node;
const name = (n: Node | undefined) => (n?.type === 'Identifier' ? (n.name as string) : undefined);

function memberName(n: Node): string | undefined {
  return n.type === 'MemberExpression' && !n.computed ? name(child(n, 'property')) : undefined;
}

/** The `await shopper.<call>(…)` inside a statement, or undefined when the statement has another shape. */
function shopperCall(expr: Node | undefined): Node | undefined {
  if (expr?.type !== 'AwaitExpression') return undefined;
  const call = child(expr, 'argument');
  if (call?.type !== 'CallExpression') return undefined;
  const callee = child(call, 'callee');
  const obj = callee.type === 'MemberExpression' ? child(callee, 'object') : undefined;
  return name(obj) === 'shopper' && SHOPPER_CALLS.has(memberName(callee) ?? '') ? call : undefined;
}

/** Rules for a test file (design 7.4, order N 6.3). */
export function lintTest(file: string, text: string): LintViolation[] {
  const out: LintViolation[] = [];
  const v = (n: Node | number, rule: string) => out.push({ file, line: typeof n === 'number' ? n : lineOf(n), rule });
  let ast: Node;
  try { ast = parseFile(text); } catch (e) { return [{ file, line: 0, rule: `the file does not parse: ${(e as Error).message}` }]; }
  const body = child(ast, 'program').body as Node[];
  let tests = 0;
  for (const st of body) {
    if (st.type === 'ImportDeclaration') {
      const specs = (st.specifiers as Node[]).map((s) => name(child(s, 'imported')));
      if ((child(st, 'source').value as string) !== '../support/core/fixtures' || specs.join() !== 'test') v(st, 'the only import is { test } from ../support/core/fixtures');
      continue;
    }
    const expr = st.type === 'ExpressionStatement' ? child(st, 'expression') : undefined;
    const callee = expr?.type === 'CallExpression' ? child(expr, 'callee') : undefined;
    if (callee && memberName(callee) === 'use' && name(child(callee, 'object')) === 'test') continue;
    if (callee && name(callee) === 'test') {
      tests++;
      const fn = (expr?.arguments as Node[])[1];
      const stmts = fn?.type === 'ArrowFunctionExpression' && child(fn, 'body').type === 'BlockStatement' ? child(child(fn, 'body'), 'body') as unknown as Node[] : [];
      if (!stmts.length) v(st, 'the test body is a block of shopper calls');
      for (const s of stmts) {
        const decl = s.type === 'VariableDeclaration' && s.kind === 'const' && (s.declarations as Node[]).length === 1 ? (s.declarations as Node[])[0] : undefined;
        const call = s.type === 'ExpressionStatement' ? shopperCall(child(s, 'expression')) : decl ? shopperCall(child(decl, 'init')) : undefined;
        if (!call) v(s, `a statement other than await shopper.add/setQuantity/remove/checkTotal (${s.type})`);
      }
      continue;
    }
    v(st, `a top-level statement other than test.use(…) and one test(…) (${callee ? 'call' : st.type})`);
  }
  if (tests !== 1) v(1, `exactly one test(…) is allowed, found ${tests}`);
  walk(ast, (n) => {
    const id = name(n);
    if (id && ['expect', 'page', 'process', 'require', 'eval'].includes(id)) v(n, `forbidden identifier ${id}`);
    if (n.type === 'CallExpression') {
      const c = child(n, 'callee');
      const ok = name(c) === 'test' || (memberName(c) === 'use' && name(child(c, 'object')) === 'test') || (c.type === 'MemberExpression' && name(child(c, 'object')) === 'shopper');
      if (!ok) v(n, `a call to something other than test, test.use or shopper (${memberName(c) ?? name(c) ?? c.type})`);
    }
    if (['IfStatement', 'TryStatement', 'ForStatement', 'ForOfStatement', 'ForInStatement', 'WhileStatement', 'DoWhileStatement', 'SwitchStatement', 'ConditionalExpression'].includes(n.type)) v(n, `control flow (${n.type})`);
    if (n.type === 'NumericLiteral' && !Number.isInteger(n.value)) v(n, `an amount literal ${String(n.value)}`);
    if ((n.type === 'StringLiteral' || n.type === 'TemplateElement') && AMOUNT_TEXT.test(String(n.type === 'StringLiteral' ? n.value : (n.value as { raw: string }).raw))) v(n, 'a string literal that reads as an amount');
  });
  return out;
}

/** Rules for a driver file (design 7.4, R13, order N 6.3). `origin` is the configured application origin. */
export function lintDriver(file: string, text: string, origin: string): LintViolation[] {
  const out: LintViolation[] = [];
  const v = (n: Node, rule: string) => out.push({ file, line: lineOf(n), rule });
  let ast: Node;
  try { ast = parseFile(text); } catch (e) { return [{ file, line: 0, rule: `the file does not parse: ${(e as Error).message}` }]; }
  const lines = text.split('\n');
  const marked = (n: Node) => /\/\/ locator-exception: \S/.test(lines[lineOf(n) - 1] ?? '');
  for (const st of child(ast, 'program').body as Node[]) {
    if (st.type !== 'ImportDeclaration') continue;
    const source = child(st, 'source').value as string;
    const inCore = source.startsWith('../support/core/');
    if (!inCore && source !== '@playwright/test') v(st, `an import from outside support/core and Playwright (${source})`);
  }
  walk(ast, (n) => {
    const member = memberName(n);
    if (member === 'waitForTimeout') v(n, 'waitForTimeout: a fixed wait instead of a completion signal');
    if (member === 'request' && name(child(n, 'object')) === 'page') v(n, 'page.request: an API call outside the UI (R13)');
    if (member === 'newContext' && memberName(child(n, 'object')) === 'request') v(n, 'request.newContext: an API call outside the UI (R13)');
    if (n.type === 'CallExpression' && name(child(n, 'callee')) === 'fetch') v(n, 'fetch: an API call outside the UI (R13)');
    if (n.type === 'StringLiteral') {
      const s = n.value as string;
      if (/^\(?\/\/|^xpath=/.test(s)) v(n, `an XPath locator ${JSON.stringify(s)}`);
      if (/^https?:\/\//.test(s) && !s.startsWith(origin)) v(n, `a URL outside the application's origin ${JSON.stringify(s)}`);
    }
    if (n.type === 'CallExpression' && memberName(child(n, 'callee')) === 'goto') {
      const arg = (n.arguments as Node[])[0];
      const lit = arg?.type === 'StringLiteral' ? (arg.value as string) : undefined;
      if (lit !== undefined && !lit.startsWith('/') && !lit.startsWith(origin)) v(n, `goto outside the application: ${JSON.stringify(lit)}`);
    }
    if (n.type === 'CallExpression' && ['locator', 'querySelector', 'querySelectorAll', 'closest'].includes(memberName(child(n, 'callee')) ?? '')) {
      const arg = (n.arguments as Node[])[0];
      if (arg?.type === 'StringLiteral' && /(^|[\s>+~,(])\.[A-Za-z_-]/.test(arg.value as string) && !marked(n)) {
        v(n, `a CSS-class locator ${JSON.stringify(arg.value)} without a "// locator-exception: <reason>" marker`);
      }
    }
  });
  return out;
}

/** Lint a test file and every driver under app/. */
export function lintRoot(root: string, testFile: string, origin: string): LintViolation[] {
  const rel = (f: string) => path.relative(root, f);
  const out = lintTest(rel(testFile), fs.readFileSync(testFile, 'utf8'));
  const appDir = path.join(root, 'app');
  for (const f of fs.existsSync(appDir) ? fs.readdirSync(appDir).filter((x) => x.endsWith('.driver.ts')) : []) {
    out.push(...lintDriver(`app/${f}`, fs.readFileSync(path.join(appDir, f), 'utf8'), origin));
  }
  return out;
}

/** The step ids of the test's own checkTotal calls, in order: the completeness count of design 6.1. */
export function testCheckpoints(text: string): string[] {
  const ids: string[] = [];
  walk(parseFile(text), (n) => {
    if (n.type === 'CallExpression' && memberName(child(n, 'callee')) === 'checkTotal' && name(child(child(n, 'callee'), 'object')) === 'shopper') {
      const arg = (n.arguments as Node[])[0];
      if (arg?.type === 'StringLiteral') ids.push(arg.value as string);
    }
  });
  return ids;
}
