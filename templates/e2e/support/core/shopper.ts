// The shopper: performs the compiled test's actions through a driver and keeps the ledger in step.
// Implements design 8.4 (allowed calls), 9.1 (soft checkpoints: after a red one it goes on from the expected
// state and fails at the end with the first mismatch) and order N, 6.8 (price source).
import { checkpointVerdict, displayedRecord, expectedRecord, formatMismatch, pollCart, type CheckContext, type CheckpointRecord, type Finding } from './checkpoint';
import { Ledger } from './ledger';
import { compare, formatMoney, type AmountFormat } from './money';
import type { PricingModule } from './pricing';
import type { PriceSource } from './scenario';
import { selectProduct } from './selection';
import type { CartDriver, Money, ProductPick, ProductRef } from './types';
import { CheckpointError, InfraError, PreconditionError, QaError, verdictOf, type Verdict } from './verdicts';

/** A failure that ended the test, as the fixture records it for the reporter. */
export type FailureRecord = { step: string | null; kind: Verdict; message: string; rawText?: string };

export type ShopperOptions = {
  driver: CartDriver;
  pricing: PricingModule;
  fmt: AmountFormat;
  rulesFile: string;
  reserved: string[];
  pickLimit: number;
  settleMs: number;
  priceSource: PriceSource;
  checkpoints: string[];                                             // expected checkpoint ids, in order
  step: (title: string, body: () => Promise<void>) => Promise<void>; // test.step
  record: (r: CheckpointRecord) => Promise<void>;                    // checkpoint attachment
  fail: (f: FailureRecord) => Promise<void>;                         // failure attachment
  afterRead?: (stepId: string) => Promise<{ screenshot?: string; control?: unknown }>;
};

export function actionText(kind: 'add' | 'setQty' | 'remove', name: string, qty?: number): string {
  if (kind === 'add') return `add ${name}, ${qty} unit${qty === 1 ? '' : 's'}`;
  if (kind === 'setQty') return `set quantity of ${name} to ${qty}`;
  return `remove ${name}`;
}

export class Shopper {
  private readonly ledger: Ledger;
  private readonly ctx: CheckContext;
  private lastAction: string | undefined;
  private lastStep: string | null = null;
  private firstRed: CheckpointError | undefined;
  private finished = false;
  private readonly apiChecks: Array<{ name: string; page: Money; api: Money }> = [];
  private readonly judged: string[] = [];

  constructor(private readonly o: ShopperOptions) {
    this.ledger = new Ledger(o.pricing.rules, o.fmt.currency);
    this.ctx = { pricing: o.pricing, fmt: o.fmt, rulesFile: o.rulesFile };
  }

  /** Run an action. Before a red checkpoint its error ends the test; after one, the first mismatch does. */
  private async act<T>(action: string, body: () => Promise<T>): Promise<T> {
    this.lastAction = action;
    try {
      return await body();
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      if (this.firstRed) {
        this.finished = true;
        await this.o.fail({ step: this.firstRed.step, kind: this.firstRed.verdict, message: `${this.firstRed.message}\n  then:      ${action} failed: ${message.split('\n')[0]}` });
        throw this.firstRed;
      }
      await this.o.fail({ step: this.lastStep, kind: verdictOf(e), message, rawText: e instanceof PreconditionError ? e.rawText : undefined });
      throw e instanceof QaError ? e : new InfraError(`${action} failed outside the driver's contract: ${message}`);
    }
  }

  async add(target: ProductPick | ProductRef, qty: number): Promise<ProductRef> {
    const known = !('pick' in target);
    const label = known ? target.name : target.pick === 'by-name' ? target.name : `the ${target.pick} product`;
    return this.act(actionText('add', label, qty), async () => {
      let name: string;
      if ('pick' in target) {
        const facts = await selectProduct(this.o.driver, target, {
          reserved: target.pick === 'by-name' ? [] : this.o.reserved,
          pickLimit: this.o.pickLimit,
          constraints: this.o.pricing.constraints,
        });
        name = facts.name;
        this.lastAction = actionText('add', name, qty);
        this.ledger.bind(this.o.priceSource === 'api' ? { ...facts, unitPrice: await this.apiPrice(facts.name, facts.unitPrice) } : facts);
      } else {
        name = target.name;
        if (!this.ledger.isBound(name)) throw new InfraError(`the test adds "${name}" again before it was picked; recompile the test.`);
      }
      await this.o.driver.addProduct(name, qty);
      this.ledger.apply({ do: 'add', key: name, qty });
      return { name };
    });
  }

  private async apiPrice(name: string, page: Money): Promise<Money> {
    if (!this.o.driver.apiPrice) {
      throw new PreconditionError(`The scenario takes prices from the API (price_source: api), but the driver has no apiPrice; run qa-harness need to see what the driver is missing.`);
    }
    const api = await this.o.driver.apiPrice(name);
    this.apiChecks.push({ name, page, api });
    return api;
  }

  async setQuantity(ref: ProductRef, qty: number): Promise<void> {
    await this.act(actionText('setQty', ref.name, qty), async () => {
      await this.o.driver.setQuantity(ref.name, qty);
      this.ledger.apply({ do: 'setQty', key: ref.name, qty });
    });
  }

  async remove(ref: ProductRef): Promise<void> {
    await this.act(actionText('remove', ref.name), async () => {
      await this.o.driver.remove(ref.name);
      this.ledger.apply({ do: 'remove', key: ref.name });
    });
  }

  async checkTotal(stepId: string): Promise<void> {
    const action = this.lastAction ?? 'no action';
    this.lastStep = stepId;
    const snap = this.ledger.snapshot();
    const title = `${stepId} · ${action} · expected ${formatMoney(snap.total, this.o.fmt)}`;
    let error: CheckpointError | undefined;
    try {
      await this.o.step(title, async () => {
        const read = await pollCart(this.o.driver, snap, this.ctx, this.o.settleMs);
        if (read.readError) {
          const e = read.readError;
          await this.o.fail({ step: stepId, kind: verdictOf(e), message: e instanceof Error ? e.message : String(e) });
          throw e instanceof QaError ? e : new InfraError(`reading the cart at ${stepId} failed: ${String(e)}`);
        }
        const findings: Finding[] = [...this.apiFindings(), ...read.findings];
        const extra = this.o.afterRead ? await this.o.afterRead(stepId) : {};
        const red = findings.length > 0;
        const message = red ? formatMismatch(stepId, action, findings) : undefined;
        await this.o.record({
          step: stepId,
          action,
          ledger: snap.lines.map((l) => ({ name: l.name, qty: l.qty, unitPrice: formatMoney(l.unitPrice, this.o.fmt), attrs: l.attrs })),
          expected: expectedRecord(snap, this.o.fmt),
          displayed: read.view ? displayedRecord(read.view, this.o.fmt) : null,
          result: red ? 'fail' : 'pass',
          ...(red ? { verdict: checkpointVerdict(findings), layer: findings[0].layer, message } : {}),
          reads: read.reads,
          elapsedMs: read.elapsedMs,
          ...extra,
        });
        this.judged.push(stepId);
        if (red) {
          error = new CheckpointError(message as string, checkpointVerdict(findings), stepId);
          throw error;
        }
      });
    } catch (e) {
      if (!error) throw e;
      this.firstRed ??= error;
    }
    if (this.firstRed && stepId === this.o.checkpoints[this.o.checkpoints.length - 1]) await this.finish();
  }

  /** The price on the product page is a checked value when prices come from the API (9.4). */
  private apiFindings(): Finding[] {
    const out = this.apiChecks.filter((c) => compare(c.page, c.api) !== 0).map((c): Finding => ({
      layer: 'unit price', verdict: 'ORACLE_MISMATCH', subject: `product page price of "${c.name}"`,
      expected: `${formatMoney(c.api, this.o.fmt)} (product API)`, displayed: `${formatMoney(c.page, this.o.fmt)} on the product page`,
      detail: `the product page and the product API disagree on the price of "${c.name}"`,
    }));
    this.apiChecks.length = 0;
    return out;
  }

  /** End of the test: the first red checkpoint becomes the test's error. */
  async finish(): Promise<void> {
    if (!this.firstRed || this.finished) return;
    this.finished = true;
    const red = this.firstRed;
    await this.o.fail({ step: red.step, kind: red.verdict, message: red.message });
    throw red;
  }

  judgedCheckpoints(): string[] {
    return [...this.judged];
  }
}
