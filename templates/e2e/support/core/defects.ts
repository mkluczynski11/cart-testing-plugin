// Defect switches of the reference cart. Each one changes one behaviour of the in-memory cart.

export const CART_DEFECTS = [
  'total-ignores-quantity',
  'total-stale-after-setqty',
  'total-stale-after-remove',
  'setqty-ignored',
  'remove-ignored',
  'remove-wrong-line',
  'add-replaces-quantity',
  'line-total-wrong',
  'discount-not-applied',
  'total-truncated',
] as const;

/** Driver variants: the cart is correct, the driver reads it wrongly. */
export const DRIVER_DEFECTS = ['driver-reads-subtotal'] as const;

export type CartDefect = (typeof CART_DEFECTS)[number];
export type DriverDefect = (typeof DRIVER_DEFECTS)[number];
export type DefectId = CartDefect | DriverDefect;

export const ALL_DEFECTS: readonly DefectId[] = [...CART_DEFECTS, ...DRIVER_DEFECTS];

export const DEFECT_DESCRIPTIONS: Record<DefectId, string> = {
  'total-ignores-quantity': 'the total counts every line as one unit',
  'total-stale-after-setqty': 'after a quantity change the lines are new, the total is old',
  'total-stale-after-remove': 'after a removal the lines are new, the total is old',
  'setqty-ignored': 'quantity change acknowledged but not applied',
  'remove-ignored': 'removal acknowledged but not applied',
  'remove-wrong-line': 'a different line disappears than the one named',
  'add-replaces-quantity': 'adding again sets the quantity instead of increasing it',
  'line-total-wrong': 'line total equals the unit price; total is correct',
  'discount-not-applied': 'discount displayed but not subtracted from the total',
  'total-truncated': 'total truncated down to the cent instead of rounded',
  'driver-reads-subtotal': 'the driver returns the subtotal row as the total',
};

export function isDefectId(x: string): x is DefectId {
  return (ALL_DEFECTS as readonly string[]).includes(x);
}

/** Read QA_DEFECT. Unknown ids are an error, not a silent healthy cart. */
export function defectFromEnv(value: string | undefined): DefectId | undefined {
  if (!value) return undefined;
  if (!isDefectId(value)) throw new Error(`unknown QA_DEFECT "${value}"; known: ${ALL_DEFECTS.join(', ')}`);
  return value;
}
