// The shopper fixture: performs scenario steps through a CartDriver and keeps the ledger.
// Product selection is done here, never by the driver.
import { runCheckpoint, type Attach } from './checkpoint';
import { Ledger } from './ledger';
import { maxQtyFor, type PricingModule, type PurchaseConstraint } from './pricing';
import type { Scenario, Step, StepKind } from './scenario';
import type { CartDriver, ProductFacts, ProductPick, ProductRef } from './types';
import { describeStep } from './validator';
import { InfraError, PreconditionError } from './verdicts';

export type SelectOptions = { reserved: string[]; pickLimit: number; constraints: PurchaseConstraint[] };

/** Walk candidates in listing order; skip reserved and distinctFrom; require stock and a constraint >= needQty. */
export async function selectProduct(driver: CartDriver, pick: ProductPick, opts: SelectOptions): Promise<ProductFacts> {
  if (pick.pick === 'by-name') {
    const facts = await driver.productFacts(pick.name);
    if (!facts.inStock) throw new PreconditionError(`"${pick.name}" is named by the scenario but is out of stock`);
    return facts;
  }
  const needQty = pick.needQty ?? 1;
  const excluded = new Set([...opts.reserved, ...(pick.pick === 'next-available' ? pick.distinctFrom.map((r) => r.name) : [])]);
  let seen = 0;
  for await (const name of driver.candidates()) {
    if (seen >= opts.pickLimit) break;
    seen++;
    if (excluded.has(name)) continue;
    const facts = await driver.productFacts(name);
    if (!facts.inStock) continue;
    const max = maxQtyFor(opts.constraints, name);
    if (max !== undefined && max < needQty) continue;
    return facts;
  }
  throw new PreconditionError(
    `no product among the first ${opts.pickLimit} candidates is in stock, allows ${needQty} unit(s) and is not excluded (${pick.pick})`,
  );
}

export type ShopperOptions = {
  driver: CartDriver;
  pricing: PricingModule;
  scenario: Scenario;
  reserved: string[];
  pickLimit: number;
  settleMs: number;
  attach: Attach;
};

export class Shopper {
  private readonly ledger: Ledger;
  private cursor = 0;
  private last: { step: Step; qty?: number } | undefined;

  constructor(private readonly o: ShopperOptions) {
    this.ledger = new Ledger(o.pricing);
  }

  /** The scenario step the next action performs; the compiled test follows the scenario's order. */
  private nextStep(kind: StepKind): Step {
    const step = this.o.scenario.steps[this.cursor];
    if (!step || step.do !== kind) {
      throw new InfraError(`the test calls ${kind} as action #${this.cursor + 1}, but the scenario has ${step ? `${step.id} ${step.do}` : 'no more steps'}; recompile the test`);
    }
    this.cursor++;
    return step;
  }

  private aliasFor(step: Step, ref: ProductRef): string {
    const alias = this.ledger.aliasOfName(ref.name);
    if (alias !== step.product) {
      throw new InfraError(`step ${step.id} acts on ${step.product}, but the test passed "${ref.name}"; recompile the test`);
    }
    return alias;
  }

  async add(target: ProductPick | ProductRef, qty: number): Promise<ProductRef> {
    const step = this.nextStep('add');
    let name: string;
    if ('pick' in target) {
      const facts = await selectProduct(this.o.driver, target, {
        reserved: target.pick === 'by-name' ? [] : this.o.reserved,
        pickLimit: this.o.pickLimit,
        constraints: this.o.pricing.constraints,
      });
      this.ledger.bind(step.product, facts);
      name = facts.name;
    } else {
      this.aliasFor(step, target);
      name = target.name;
    }
    await this.o.driver.addProduct(name, qty);
    this.ledger.apply({ do: 'add', key: step.product, qty });
    this.last = { step, qty };
    return { name };
  }

  async setQuantity(ref: ProductRef, qty: number): Promise<void> {
    const step = this.nextStep('setQty');
    const alias = this.aliasFor(step, ref);
    await this.o.driver.setQuantity(ref.name, qty);
    this.ledger.apply({ do: 'setQty', key: alias, qty });
    this.last = { step, qty };
  }

  async remove(ref: ProductRef): Promise<void> {
    const step = this.nextStep('remove');
    const alias = this.aliasFor(step, ref);
    await this.o.driver.remove(ref.name);
    this.ledger.apply({ do: 'remove', key: alias });
    this.last = { step };
  }

  async checkTotal(stepId: string): Promise<void> {
    if (!this.last || this.last.step.id !== stepId) {
      throw new InfraError(`checkTotal('${stepId}') does not follow step ${stepId}; recompile the test`);
    }
    const { step, qty } = this.last;
    await runCheckpoint({
      driver: this.o.driver,
      pricing: this.o.pricing,
      snapshot: this.ledger.snapshot(),
      stepId,
      action: describeStep({ do: step.do, product: step.product, qty }),
      settleMs: this.o.settleMs,
      attach: this.o.attach,
    });
  }
}
