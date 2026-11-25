// A deliberately wrong driver for the control page: it reads the subtotal as the total (design 10.8).
// It takes the label of the second summary group (the total only when there is no discount) and the amount
// of the subtotal group: two locators for one row, the mistake the label check and skew-total exist for.
import type { Page } from '@playwright/test';
import type { CartDriver, CartView, DriverOptions } from '../../core/types';
import { createDriver as createCorrect } from './control.driver';

export function createDriver(page: Page, options: DriverOptions): CartDriver {
  const correct = createCorrect(page, options);
  return {
    ...correct,
    async readCart(): Promise<CartView> {
      const view = await correct.readCart();
      if (view.empty || !view.subtotal) return view;
      const second = view.adjustments[0] ?? view.total;
      return { ...view, total: { ...view.subtotal, label: second.label } };
    },
  };
}
