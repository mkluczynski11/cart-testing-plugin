// Every call into the application driver gets a time limit and a classified failure that names the method.
// Implements design 6.1 ("an action that did not find its element" is LOCATOR_FAIL; the environment is INFRA_FAIL)
// and 6.3 (UNDETERMINED when the evidence does not settle the cause); report V F4, report D request 6.
import type { CartDriver } from './types';
import { InfraError, LocatorError, QaError, UndeterminedError } from './verdicts';

/** A driver call may take this many times actionMs: its own waits (navigation, element, acknowledgment) use actionMs each. */
export const CALL_LIMIT_FACTOR = 3;

/** Messages of the environment: the network, the browser going away. */
const ENVIRONMENT = /net::ERR_|ECONNREFUSED|ECONNRESET|ENOTFOUND|EAI_AGAIN|ETIMEDOUT|socket hang up|has been closed|browser has disconnected/i;

const firstLine = (s: string) => s.split('\n')[0].trim();

/** The verdict-carrying error for a failed driver call. */
export function driverCallError(method: string, e: unknown): QaError {
  if (e instanceof QaError) {
    if (!e.message.includes(method)) e.message = `${method}: ${e.message}`;
    return e;
  }
  const message = firstLine(e instanceof Error ? e.message : String(e));
  if (e instanceof Error && e.name === 'TimeoutError') {
    return new LocatorError(`${method}: ${message} The element it waited for did not appear; the driver did not find its element.`);
  }
  if (ENVIRONMENT.test(message)) return new InfraError(`${method}: ${message}`);
  const kind = e instanceof Error ? e.name : typeof e;
  return new UndeterminedError(`${method} threw ${kind}: ${message}. The evidence does not say whether the driver or the application is at fault; read ${method} in the driver and the trace of the run.`);
}

/** Run one driver call within `limitMs`, classifying what it throws. */
export async function driverCall<T>(method: string, limitMs: number, body: () => Promise<T>): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const limit = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new LocatorError(`${method} did not return within ${limitMs} ms (${CALL_LIMIT_FACTOR} × actionMs); the element or the acknowledgment it waits for never came.`)), limitMs);
  });
  try {
    return await Promise.race([body(), limit]);
  } catch (e) {
    throw driverCallError(method, e);
  } finally {
    clearTimeout(timer);
  }
}

const CALLS = new Set(['productFacts', 'addProduct', 'setQuantity', 'remove', 'readCart', 'setAttribute', 'apiPrice']);

/** The driver with every method call limited and classified; `candidates` is limited per product name. */
export function guardDriver(driver: CartDriver, actionMs: number): CartDriver {
  const limitMs = CALL_LIMIT_FACTOR * actionMs;
  return new Proxy(driver, {
    get(target, prop, receiver) {
      const value: unknown = Reflect.get(target, prop, receiver);
      if (typeof value !== 'function') return value;
      const method = String(prop);
      if (method === 'candidates') {
        return () => {
          const it = (value as CartDriver['candidates']).call(target)[Symbol.asyncIterator]();
          return { [Symbol.asyncIterator]: () => ({ next: () => driverCall('candidates', limitMs, () => it.next()) }) };
        };
      }
      if (!CALLS.has(method)) return value;
      return (...args: unknown[]) => driverCall(method, limitMs, () => (value as (...a: unknown[]) => Promise<unknown>).apply(target, args));
    },
  });
}
