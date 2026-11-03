// Keep money calculations pure so UI changes cannot alter the pricing rules.
export function calculate(quantity, coupon) {
  const subtotal = Math.max(1, Math.min(20, quantity)) * 48;
  const discount = coupon ? Math.round(subtotal * 0.2 * 100) / 100 : 0;
  return { subtotal, discount, total: subtotal - discount };
}
