// Format an integer number of US cents as a price string. Prices are stored as
// cents (integers) to avoid floating-point money bugs.

const CAD = new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' });

export function formatPrice(cents: number): string {
  if (cents <= 0) return 'Free';
  return CAD.format(cents / 100);
}
