export function decimalPlaces(value: number) {
  const text = value.toString();
  return text.includes('.') ? text.split('.')[1].length : 0;
}

export function normalizeQuantity(
  quantity: number,
  minimumQuantity: number,
  stepQuantity: number,
  maximumQuantity = Number.POSITIVE_INFINITY
) {
  const minimum = Math.max(0, Number(minimumQuantity) || 1);
  const step = Math.max(0.0001, Number(stepQuantity) || 1);
  const maximum = Number.isFinite(maximumQuantity) ? Math.max(0, maximumQuantity) : maximumQuantity;
  if (maximum < minimum) return 0;

  const requestedSteps = Math.max(0, Math.round((quantity - minimum) / step));
  const maximumSteps = Number.isFinite(maximum)
    ? Math.max(0, Math.floor((maximum - minimum + 1e-9) / step))
    : requestedSteps;
  const steps = Math.min(requestedSteps, maximumSteps);
  const precision = Math.min(6, Math.max(decimalPlaces(minimum), decimalPlaces(step)));
  return Number((minimum + steps * step).toFixed(precision));
}

export function calculateItemTotal(price: number, quantity: number) {
  return Number((price * quantity).toFixed(2));
}

export function calculateOrderSubtotal(items: Array<{ price: number; quantity: number }>) {
  return Number(
    items.reduce((total, item) => total + calculateItemTotal(item.price, item.quantity), 0).toFixed(2)
  );
}
