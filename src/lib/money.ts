// Format an integer number of US cents as a price string. Prices are stored as
// cents (integers) to avoid floating-point money bugs.

const USD = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

export function formatPrice(cents: number): string {
  if (cents <= 0) return 'Free';
  return USD.format(cents / 100);
}
