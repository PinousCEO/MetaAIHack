import { calculate } from './pricing.js';
function updateCart() {
  const quantity = Number(document.querySelector('#quantity').value) || 1;
  const price = calculate(quantity, coupon);
  for (const key of ['subtotal', 'discount', 'total'])
    document.querySelector('#' + key).textContent = '$' + price[key].toFixed(2);
}
let coupon = false;
document.querySelector('#quantity').addEventListener('input', updateCart);
function applyCoupon() {
  coupon = !coupon;
  document.querySelector('#notice').textContent = coupon ? '20% coupon applied.' : 'Coupon removed.';
  document.querySelector('#coupon').textContent = coupon ? 'Remove coupon' : 'Apply WEEKEND20';
  updateCart();
}
document.querySelector('#coupon').addEventListener('click', applyCoupon);
setInterval(() => document.querySelector('#clock').textContent = new Date().toLocaleTimeString('en-GB'), 1000);
updateCart();
