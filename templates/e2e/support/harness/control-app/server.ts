// The control page of selftest: a small shop served by Node's http module, unlike a table-based cart on purpose.
// Implements order N, 6.7 and the control-page row of design 10.8. It imports nothing from support/core:
// its rule (10% off from a subtotal of 50,00 €) is computed here in plain integer cents, independently.
import { randomBytes } from 'node:crypto';
import * as fs from 'node:fs';
import * as http from 'node:http';
import type { AddressInfo } from 'node:net';
import * as path from 'node:path';

type Product = { id: string; name: string; cents: number; inStock: boolean };
type Item = { id: string; productId: string; qty: number };

const PRODUCTS: Product[] = [
  { id: 'p1', name: 'Teekanne', cents: 2490, inStock: true },
  { id: 'p2', name: 'Kaffeebecher', cents: 750, inStock: true },
  { id: 'p3', name: 'Brotdose', cents: 1200, inStock: true },
  { id: 'p4', name: 'Gewürzregal', cents: 3300, inStock: false },
  { id: 'p5', name: 'Wasserflasche', cents: 1840, inStock: true },
  { id: 'p6', name: 'Holztisch', cents: 124900, inStock: true },
];

const DISCOUNT_FROM = 5000;
const DISCOUNT_PERCENT = 10;

const decimal = (cents: number) => `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, '0')}`;

/** The cart as the API returns it: lines, subtotal, discount (rounded half up) and total, in decimal strings. */
function cartBody(items: Item[]) {
  const lines = items.map((i) => {
    const p = PRODUCTS.find((x) => x.id === i.productId) as Product;
    return { id: i.id, productId: p.id, name: p.name, qty: i.qty, price: decimal(p.cents), lineTotal: decimal(p.cents * i.qty) };
  });
  const subtotal = items.reduce((s, i) => s + (PRODUCTS.find((x) => x.id === i.productId) as Product).cents * i.qty, 0);
  const discount = subtotal >= DISCOUNT_FROM ? Math.floor((subtotal * DISCOUNT_PERCENT + 50) / 100) : 0;
  return { items: lines, subtotal: decimal(subtotal), discount: discount ? decimal(discount) : null, total: decimal(subtotal - discount) };
}

function readBody(req: http.IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (c) => { data += c; });
    req.on('end', () => { try { resolve(data ? JSON.parse(data) as Record<string, unknown> : {}); } catch { resolve({}); } });
  });
}

export type ControlApp = { url: string; stop: () => Promise<void> };

/** Start the control page on 127.0.0.1 and an ephemeral port; `stop` closes it. */
export function startControlApp(): Promise<ControlApp> {
  const carts = new Map<string, Item[]>();
  const page = fs.readFileSync(path.join(__dirname, 'page.html'), 'utf8');
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1');
    const sid = /(?:^|;\s*)sid=([a-f0-9]+)/.exec(req.headers.cookie ?? '')?.[1] ?? randomBytes(8).toString('hex');
    res.setHeader('Set-Cookie', `sid=${sid}; Path=/; HttpOnly; SameSite=Lax`);
    const items = carts.get(sid) ?? [];
    carts.set(sid, items);
    const json = (status: number, body?: unknown) => {
      res.writeHead(status, body === undefined ? {} : { 'Content-Type': 'application/json' });
      res.end(body === undefined ? undefined : JSON.stringify(body));
    };
    const item = /^\/api\/cart\/items\/([a-z0-9]+)$/.exec(url.pathname);
    if (req.method === 'GET' && url.pathname === '/') { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(page); return; }
    if (req.method === 'GET' && url.pathname === '/api/products') return json(200, PRODUCTS.map((p) => ({ id: p.id, name: p.name, price: decimal(p.cents), inStock: p.inStock })));
    if (req.method === 'GET' && url.pathname === '/api/cart') return json(200, cartBody(items));
    if (req.method === 'POST' && url.pathname === '/api/cart/items') {
      const body = await readBody(req);
      const product = PRODUCTS.find((p) => p.id === body.productId);
      const qty = Number(body.qty);
      if (!product || !Number.isInteger(qty) || qty < 1) return json(400, { message: 'Ungültige Anfrage.' });
      if (!product.inStock) return json(409, { message: `${product.name} ist nicht vorrätig.` });
      const line = items.find((i) => i.productId === product.id);
      if (line) line.qty += qty; else items.push({ id: randomBytes(4).toString('hex'), productId: product.id, qty });
      return json(201, { ok: true });
    }
    if (item && req.method === 'PUT') {
      const body = await readBody(req);
      const line = items.find((i) => i.id === item[1]);
      const qty = Number(body.qty);
      if (!line || !Number.isInteger(qty) || qty < 1) return json(400, { message: 'Ungültige Menge.' });
      line.qty = qty;
      return json(200, { ok: true });
    }
    if (item && req.method === 'DELETE') {
      const at = items.findIndex((i) => i.id === item[1]);
      if (at < 0) return json(404, { message: 'Nicht im Warenkorb.' });
      items.splice(at, 1);
      return json(204);
    }
    json(404, { message: 'Nicht gefunden.' });
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo;
      resolve({ url: `http://127.0.0.1:${port}`, stop: () => new Promise((done) => { server.closeAllConnections(); server.close(() => done()); }) });
    });
  });
}
